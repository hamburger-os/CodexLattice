import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertCodexCompatible, codexInstallHint, probeCodex, runCodex } from './codex.js';
import {
  managedAgentBlock,
  ownedAgentFilenames,
  renderRoleFile,
  roleSpecs,
  sha256
} from './roles.js';

export const PACKAGE_VERSION = '0.2.4';
export const START = '# >>> CodexLattice managed block >>>';
export const END = '# <<< CodexLattice managed block <<<';

function activeBlock() {
  return managedAgentBlock(START, END);
}

export function codexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

function configPath(home) {
  return path.join(home, 'config.toml');
}

function agentsDir(home) {
  return path.join(home, 'agents');
}

function stateDir(home) {
  return path.join(home, 'codex-lattice');
}

export function receiptPath(home = codexHome()) {
  return path.join(stateDir(home), 'install.json');
}

export function withoutManaged(text) {
  const start = text.indexOf(START);
  if (start === -1) return text.trimEnd();
  const end = text.indexOf(END, start);
  if (end === -1) throw new Error('malformed CodexLattice managed block: missing end marker');
  const secondStart = text.indexOf(START, end + END.length);
  if (secondStart !== -1) throw new Error('multiple CodexLattice managed blocks detected; refusing to guess which one to edit');
  const after = end + END.length;
  const suffix = text.slice(after).replace(/^\r?\n/, '');
  return `${text.slice(0, start)}${suffix}`.trimEnd();
}

export function isManagedActive(text) {
  const start = text.indexOf(START);
  const end = text.indexOf(END, start + START.length);
  return start !== -1 && end > start;
}

function stripComment(line) {
  let quoted = false;
  let escaped = false;
  let out = '';
  for (const ch of line) {
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && quoted) {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      out += ch;
      continue;
    }
    if (ch === '#' && !quoted) break;
    out += ch;
  }
  return out.trim();
}

function explicitMultiAgentDisabled(text) {
  let section = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw);
    if (!line) continue;
    const header = line.match(/^\[([^\]]+)]$/);
    if (header) {
      section = header[1].trim();
      continue;
    }
    if (section === 'agents' && /^enabled\s*=\s*false\b/i.test(line)) return '[agents].enabled = false';
    if (!section && /^agents\.enabled\s*=\s*false\b/i.test(line)) return 'agents.enabled = false';
    if (section === 'features' && /^multi_agent(?:_v2)?\s*=\s*false\b/i.test(line)) return `[features] ${line}`;
    if (/^features\.multi_agent(?:_v2)?\s*=\s*false\b/i.test(line)) return line;
    if (/^features\.multi_agent(?:_v2)?\.enabled\s*=\s*false\b/i.test(line)) return line;
    if (/^features\.multi_agent(?:_v2)?$/.test(section) && /^enabled\s*=\s*false\b/i.test(line)) return `[${section}].enabled = false`;
  }
  return null;
}

function assertBaselineSafe(text) {
  const baseline = withoutManaged(text);
  if (/^\s*agents\s*=\s*\{/m.test(baseline)) {
    throw new Error('top-level inline `agents = { ... }` configuration cannot be safely extended with CodexLattice agent tables');
  }
  for (const spec of roleSpecs()) {
    const escaped = spec.agentType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`^\\s*\\[agents\\.${escaped}\\]\\s*$`, 'm').test(baseline)) {
      throw new Error(`unmanaged [agents.${spec.agentType}] already exists; refusing to overwrite it`);
    }
  }
  const disabled = explicitMultiAgentDisabled(baseline);
  if (disabled) {
    throw new Error(`adaptive mode cannot be installed while multi-agent support is explicitly disabled by ${disabled}`);
  }
  return baseline;
}

export function adaptiveConfig(text) {
  const baseline = assertBaselineSafe(text);
  return `${baseline ? `${baseline}\n\n` : ''}${activeBlock()}\n`;
}

export function passthroughConfig(text) {
  const baseline = withoutManaged(text);
  return baseline ? `${baseline}\n` : '';
}

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  let mode;
  try {
    if (fs.existsSync(file)) mode = fs.statSync(file).mode;
    fs.writeFileSync(temp, content, mode ? { mode } : undefined);
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
  }
}

function snapshotFiles(home) {
  const files = new Map();
  const paths = [configPath(home), ...ownedAgentFilenames().map((name) => path.join(agentsDir(home), name)), receiptPath(home)];
  for (const file of paths) {
    if (fs.existsSync(file)) files.set(file, { exists: true, content: fs.readFileSync(file), mode: fs.statSync(file).mode });
    else files.set(file, { exists: false });
  }
  return files;
}

function restoreSnapshot(snapshot) {
  for (const [file, state] of snapshot) {
    if (!state.exists) {
      fs.rmSync(file, { force: true });
      continue;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, state.content, { mode: state.mode });
  }
}

function writeRouteRoles(home) {
  fs.mkdirSync(agentsDir(home), { recursive: true });
  const manifest = [];
  for (const spec of roleSpecs()) {
    const content = renderRoleFile(spec);
    const file = path.join(agentsDir(home), spec.filename);
    atomicWrite(file, content);
    manifest.push({
      agentType: spec.agentType,
      stage: spec.stage,
      model: spec.model,
      effort: spec.effort,
      file,
      filename: spec.filename,
      sha256: sha256(content)
    });
  }
  for (const legacy of ['codex-lattice-explorer.toml', 'codex-lattice-planner.toml', 'codex-lattice-implementer.toml', 'codex-lattice-reviewer.toml']) {
    fs.rmSync(path.join(agentsDir(home), legacy), { force: true });
  }
  return manifest;
}

function removeOwnedRoles(home) {
  for (const filename of ownedAgentFilenames()) fs.rmSync(path.join(agentsDir(home), filename), { force: true });
}

function readConfig(home) {
  const file = configPath(home);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function managedBlockHash(text) {
  const start = text.indexOf(START);
  const end = text.indexOf(END, start + START.length);
  if (start === -1 || end === -1) return null;
  return sha256(text.slice(start, end + END.length));
}

function roleIntegrity(home) {
  const expected = roleSpecs();
  const results = [];
  for (const spec of expected) {
    const file = path.join(agentsDir(home), spec.filename);
    const expectedContent = renderRoleFile(spec);
    const actual = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    results.push({
      agentType: spec.agentType,
      file,
      exists: actual !== null,
      ok: actual !== null && sha256(actual) === sha256(expectedContent),
      expectedSha256: sha256(expectedContent),
      actualSha256: actual === null ? null : sha256(actual)
    });
  }
  return results;
}

function writeReceipt(home, { mode, codexVersion, roles, validation }) {
  fs.mkdirSync(stateDir(home), { recursive: true });
  const config = readConfig(home);
  const receipt = {
    schemaVersion: 1,
    packageVersion: PACKAGE_VERSION,
    installedAt: new Date().toISOString(),
    mode,
    backend: 'native-route-specific-agent-roles',
    codexVersion,
    minimumCodexVersion: '0.149.0',
    testedCodexVersion: '0.149.1',
    managedBlockSha256: mode === 'adaptive' ? managedBlockHash(config) : null,
    roles: roles.map(({ agentType, stage, model, effort, filename, sha256: hash }) => ({ agentType, stage, model, effort, filename, sha256: hash })),
    validation: {
      overallStatus: validation.overallStatus,
      warnings: validation.warnings
    }
  };
  atomicWrite(receiptPath(home), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function readReceipt(home) {
  const file = receiptPath(home);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

function validateNativeInstall(home, runner) {
  return probeCodex({ home, runner, checkConfig: true, checkModels: true });
}

function assertOwnedFileCollisionsSafe(home, configText) {
  if (isManagedActive(configText) || readReceipt(home)) return;
  const collisions = ownedAgentFilenames()
    .map((filename) => path.join(agentsDir(home), filename))
    .filter((file) => fs.existsSync(file));
  if (collisions.length) {
    throw new Error(`existing CodexLattice-namespaced role file(s) are not associated with a validated installation: ${collisions.join(', ')}`);
  }
}

export function install(mode = 'adaptive', { home = codexHome(), runner = runCodex } = {}) {
  if (!['adaptive', 'single'].includes(mode)) throw new Error('mode must be adaptive or single');
  try {
    assertCodexCompatible({ home, runner });
  } catch (error) {
    throw new Error(`${error.message} ${codexInstallHint()}`);
  }

  fs.mkdirSync(home, { recursive: true });
  const config = configPath(home);
  const existing = readConfig(home);
  if (mode === 'adaptive') {
    assertBaselineSafe(existing);
    assertOwnedFileCollisionsSafe(home, existing);
  }
  const snapshot = snapshotFiles(home);
  const backup = existing ? path.join(home, `config.toml.codex-lattice-backup-${Date.now()}`) : null;
  if (backup) fs.writeFileSync(backup, existing);

  try {
    let roles = [];
    if (mode === 'adaptive') {
      roles = writeRouteRoles(home);
      atomicWrite(config, adaptiveConfig(existing));
    } else {
      atomicWrite(config, passthroughConfig(existing));
      removeOwnedRoles(home);
    }

    const validation = validateNativeInstall(home, runner);
    if (validation.overallStatus === 'error') throw new Error(validation.errors.join(' '));
    const receipt = writeReceipt(home, { mode, codexVersion: validation.version, roles, validation });
    return { home, config, backup, mode, validation, receipt };
  } catch (error) {
    restoreSnapshot(snapshot);
    if (backup) fs.rmSync(backup, { force: true });
    const rollbackNote = 'Installation changes were rolled back to the pre-install state.';
    throw new Error(`${error.message} ${rollbackNote}`);
  }
}

export function setMode(mode, { home = codexHome(), runner = runCodex } = {}) {
  if (!['adaptive', 'single'].includes(mode)) throw new Error('mode must be adaptive or single');
  try {
    assertCodexCompatible({ home, runner });
  } catch (error) {
    throw new Error(`${error.message} ${codexInstallHint()}`);
  }

  fs.mkdirSync(home, { recursive: true });
  const config = configPath(home);
  const existing = readConfig(home);
  if (mode === 'adaptive') {
    assertBaselineSafe(existing);
    assertOwnedFileCollisionsSafe(home, existing);
  }
  const snapshot = snapshotFiles(home);

  try {
    let roles = [];
    if (mode === 'adaptive') {
      roles = writeRouteRoles(home);
      atomicWrite(config, adaptiveConfig(existing));
    } else {
      atomicWrite(config, passthroughConfig(existing));
      removeOwnedRoles(home);
    }
    const validation = validateNativeInstall(home, runner);
    if (validation.overallStatus === 'error') throw new Error(validation.errors.join(' '));
    const receipt = writeReceipt(home, { mode, codexVersion: validation.version, roles, validation });
    return { home, config, mode, validation, receipt };
  } catch (error) {
    restoreSnapshot(snapshot);
    throw new Error(`${error.message} Mode switch was rolled back.`);
  }
}

export function doctor({ home = codexHome(), runner = runCodex } = {}) {
  const config = configPath(home);
  const configText = readConfig(home);
  const receipt = readReceipt(home);
  const active = isManagedActive(configText);
  const roles = roleIntegrity(home);
  const probe = probeCodex({ home, runner, checkConfig: true, checkModels: true });
  const errors = [...probe.errors];
  const warnings = [...probe.warnings];

  if (!fs.existsSync(config)) errors.push('CODEX_HOME/config.toml does not exist.');
  if (!receipt) errors.push('CodexLattice installation receipt is missing or unreadable; run `codex-lattice install adaptive`.');
  if (active) {
    const badRoles = roles.filter((role) => !role.ok);
    if (badRoles.length) errors.push(`${badRoles.length} installed route role file(s) are missing or modified.`);
    if (receipt?.managedBlockSha256 && managedBlockHash(configText) !== receipt.managedBlockSha256) {
      errors.push('The active CodexLattice managed block differs from the validated installation receipt.');
    }
  } else if (receipt?.mode === 'adaptive') {
    errors.push('Receipt says adaptive mode is active, but the managed block is absent.');
  }

  if (receipt?.mode === 'single' && active) errors.push('Receipt says single mode, but an adaptive managed block is still active.');

  return {
    overallStatus: errors.length ? 'error' : warnings.length ? 'warning' : 'ok',
    codexHome: home,
    config,
    configExists: fs.existsSync(config),
    adaptiveActive: active,
    receipt,
    roles: active ? roles : [],
    nativeProbe: probe,
    errors,
    warnings
  };
}

export function assertReadyForRun({ home = codexHome(), runner = runCodex } = {}) {
  let base;
  try {
    base = assertCodexCompatible({ home, runner });
  } catch (error) {
    throw new Error(`${error.message} ${codexInstallHint()}`);
  }
  const configText = readConfig(home);
  if (!isManagedActive(configText)) throw new Error('CodexLattice adaptive mode is not active. Run `codex-lattice install adaptive` or `codex-lattice mode adaptive`.');
  const receipt = readReceipt(home);
  if (!receipt || receipt.mode !== 'adaptive') throw new Error('CodexLattice installation receipt is missing/stale. Run `codex-lattice install adaptive` to revalidate the installation.');
  if (receipt.packageVersion !== PACKAGE_VERSION) throw new Error(`CodexLattice was installed by version ${receipt.packageVersion || 'unknown'}, but the running CLI is ${PACKAGE_VERSION}. Run \`codex-lattice install adaptive\` to revalidate and migrate the native installation.`);
  if (receipt.codexVersion !== base.version) throw new Error(`Codex changed from validated version ${receipt.codexVersion || 'unknown'} to ${base.version}. Run \`codex-lattice install adaptive\` to revalidate compatibility before running.`);
  if (receipt.managedBlockSha256 !== managedBlockHash(configText)) throw new Error('CodexLattice managed config has drifted since validation. Run `codex-lattice doctor --strict`, then reinstall adaptive mode.');
  const badRoles = roleIntegrity(home).filter((role) => !role.ok);
  if (badRoles.length) throw new Error(`CodexLattice route role files are missing or modified (${badRoles.length}). Run \`codex-lattice install adaptive\` to repair.`);
  return { ready: true, codexVersion: base.version, receipt };
}

export function uninstall({ home = codexHome(), runner = runCodex } = {}) {
  fs.mkdirSync(home, { recursive: true });
  const config = configPath(home);
  if (fs.existsSync(config)) atomicWrite(config, passthroughConfig(fs.readFileSync(config, 'utf8')));
  removeOwnedRoles(home);
  fs.rmSync(receiptPath(home), { force: true });

  let validation = null;
  try {
    validation = probeCodex({ home, runner, checkConfig: true, checkModels: false });
  } catch {
    validation = null;
  }
  return { home, config, validation };
}
