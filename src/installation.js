import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MIN_CODEX_VERSION,
  TESTED_CODEX_VERSION,
  assertCodexCompatible,
  codexInstallHint,
  probeCodex,
  runCodex
} from './codex.js';
import {
  hookRuntimeAssets,
  hooksDocumentHasUserContent,
  hooksPath,
  managedHookLocations,
  parseHooksDocument,
  renderHooksDocument,
  withManagedHook,
  withoutManagedHook
} from './hooks.js';
import {
  managedAgentBlock,
  ownedAgentFilenames,
  renderRoleFile,
  roleSpecs,
  sha256
} from './roles.js';

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
export const PACKAGE_VERSION = packageJson.version;
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

function explicitFeatureDisabled(text, names) {
  let section = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw);
    if (!line) continue;
    const header = line.match(/^\[([^\]]+)]$/);
    if (header) {
      section = header[1].trim();
      continue;
    }
    for (const name of names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (section === 'features' && new RegExp(`^${escaped}\\s*=\\s*false\\b`, 'i').test(line)) {
        return `[features] ${line}`;
      }
      if (new RegExp(`^features\\.${escaped}\\s*=\\s*false\\b`, 'i').test(line)) return line;
      if (new RegExp(`^features\\.${escaped}\\.enabled\\s*=\\s*false\\b`, 'i').test(line)) return line;
      if (section === `features.${name}` && /^enabled\s*=\s*false\b/i.test(line)) return `[${section}].enabled = false`;
    }
  }
  return null;
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
  }
  return explicitFeatureDisabled(text, ['multi_agent', 'multi_agent_v2']);
}

function explicitHooksDisabled(text) {
  return explicitFeatureDisabled(text, ['hooks']);
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
  const disabledAgents = explicitMultiAgentDisabled(baseline);
  if (disabledAgents) {
    throw new Error(`adaptive mode cannot be installed while multi-agent support is explicitly disabled by ${disabledAgents}`);
  }
  const disabledHooks = explicitHooksDisabled(baseline);
  if (disabledHooks) {
    throw new Error(`transparent adaptive mode cannot be installed while hooks are explicitly disabled by ${disabledHooks}`);
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

function atomicWrite(file, content, requestedMode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  let mode = requestedMode;
  try {
    if (mode === undefined && fs.existsSync(file)) mode = fs.statSync(file).mode;
    fs.writeFileSync(temp, content, mode === undefined ? undefined : { mode });
    fs.renameSync(temp, file);
    if (requestedMode !== undefined && process.platform !== 'win32') fs.chmodSync(file, requestedMode);
  } finally {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
  }
}

function readConfig(home) {
  const file = configPath(home);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function readHooks(home) {
  const file = hooksPath(home);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function readReceipt(home) {
  const file = receiptPath(home);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

function snapshotFiles(home, receipt = readReceipt(home)) {
  const files = new Map();
  const runtimePaths = new Set(hookRuntimeAssets(home, PACKAGE_VERSION).map((asset) => asset.file));
  for (const entry of receipt?.runtime?.files || []) {
    if (typeof entry?.file === 'string') runtimePaths.add(entry.file);
  }
  const paths = [
    configPath(home),
    hooksPath(home),
    ...ownedAgentFilenames().map((name) => path.join(agentsDir(home), name)),
    ...runtimePaths,
    receiptPath(home)
  ];
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

function removeOwnedRoles(home, filenames = ownedAgentFilenames()) {
  for (const filename of filenames) fs.rmSync(path.join(agentsDir(home), filename), { force: true });
}

function receiptRoleFilenames(receipt) {
  if (!Array.isArray(receipt?.roles)) return [];
  const known = new Set(ownedAgentFilenames());
  return receipt.roles
    .map((role) => role?.filename)
    .filter((filename) => typeof filename === 'string' && known.has(filename));
}

function managedBlockHash(text) {
  const start = text.indexOf(START);
  const end = text.indexOf(END, start + START.length);
  if (start === -1 || end === -1) return null;
  return sha256(text.slice(start, end + END.length));
}

function roleIntegrity(home) {
  const results = [];
  for (const spec of roleSpecs()) {
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

function writeHookRuntime(home) {
  const assets = hookRuntimeAssets(home, PACKAGE_VERSION);
  const files = [];
  for (const asset of assets) {
    atomicWrite(asset.file, asset.content, asset.mode);
    files.push({ filename: asset.filename, file: asset.file, sha256: sha256(asset.content), mode: asset.mode });
  }
  return { dir: path.dirname(assets[0].file), files };
}

function runtimeIntegrity(receipt) {
  const files = [];
  for (const entry of receipt?.runtime?.files || []) {
    const actual = typeof entry?.file === 'string' && fs.existsSync(entry.file) ? fs.readFileSync(entry.file) : null;
    const actualHash = actual === null ? null : sha256(actual);
    files.push({
      filename: entry?.filename,
      file: entry?.file,
      exists: actual !== null,
      expectedSha256: entry?.sha256,
      actualSha256: actualHash,
      ok: actual !== null && typeof entry?.sha256 === 'string' && actualHash === entry.sha256
    });
  }
  return files;
}

function removeReceiptRuntime(receipt) {
  const preserved = [];
  for (const entry of receipt?.runtime?.files || []) {
    if (typeof entry?.file !== 'string' || !fs.existsSync(entry.file)) continue;
    const actualHash = sha256(fs.readFileSync(entry.file));
    if (typeof entry.sha256 === 'string' && actualHash === entry.sha256) fs.rmSync(entry.file, { force: true });
    else preserved.push(entry.file);
  }
  if (receipt?.runtime?.dir && fs.existsSync(receipt.runtime.dir)) {
    try { fs.rmdirSync(receipt.runtime.dir); } catch {}
  }
  return preserved;
}

function removeSupersededRuntime(previousReceipt, currentRuntime) {
  const previousDir = previousReceipt?.runtime?.dir;
  const currentDir = currentRuntime?.dir;
  if (!previousDir || !currentDir) return [];
  if (path.resolve(previousDir) === path.resolve(currentDir)) return [];
  return removeReceiptRuntime(previousReceipt);
}

function assertOwnedFileCollisionsSafe(home, configText, receipt) {
  if (isManagedActive(configText) || receipt) return;
  const collisions = ownedAgentFilenames()
    .map((filename) => path.join(agentsDir(home), filename))
    .filter((file) => fs.existsSync(file));
  if (collisions.length) {
    throw new Error(`existing CodexLattice-namespaced role file(s) are not associated with a validated installation: ${collisions.join(', ')}`);
  }
}

function assertHookCollisionSafe(document, configText, receipt) {
  const locations = managedHookLocations(document);
  if (locations.length > 1) throw new Error('multiple CodexLattice hook handlers detected; refusing to guess which one is owned');
  if (locations.length && !isManagedActive(configText) && !receipt?.hook) {
    throw new Error('an existing CodexLattice hook marker is not associated with a validated installation; refusing to overwrite it');
  }
}

function assertRuntimeCollisionSafe(home, receipt) {
  const owned = new Set((receipt?.runtime?.files || []).map((entry) => entry?.file).filter(Boolean));
  const collisions = hookRuntimeAssets(home, PACKAGE_VERSION)
    .map((asset) => asset.file)
    .filter((file) => fs.existsSync(file) && !owned.has(file));
  if (collisions.length) {
    throw new Error(`existing CodexLattice runtime file(s) are not associated with the installation receipt: ${collisions.join(', ')}`);
  }
}

function writeManagedHooks(home, existingText, previousReceipt) {
  const preexisting = previousReceipt?.hook?.preexisting ?? fs.existsSync(hooksPath(home));
  const document = parseHooksDocument(existingText);
  const next = withManagedHook(document, home, PACKAGE_VERSION);
  const text = renderHooksDocument(next);
  atomicWrite(hooksPath(home), text);
  const location = managedHookLocations(next)[0];
  return {
    path: hooksPath(home),
    preexisting,
    event: location.event,
    groupIndex: location.groupIndex,
    handlerIndex: location.handlerIndex,
    handler: location.handler,
    documentSha256: sha256(text),
    trust: 'requires one-time Codex review; Codex owns trust state'
  };
}

function removeManagedHooks(home, receipt, { allowActiveOwnership = false } = {}) {
  const file = hooksPath(home);
  if (!fs.existsSync(file)) return { removed: false, preservedFile: false };
  const document = parseHooksDocument(fs.readFileSync(file, 'utf8'));
  const locations = managedHookLocations(document);
  const owned = Boolean(receipt?.hook || allowActiveOwnership);
  if (!owned || !locations.length) return { removed: false, preservedFile: true };
  const next = withoutManagedHook(document);
  const shouldKeep = receipt?.hook?.preexisting !== false || hooksDocumentHasUserContent(next);
  if (shouldKeep) atomicWrite(file, renderHooksDocument(next));
  else fs.rmSync(file, { force: true });
  return { removed: true, preservedFile: shouldKeep };
}

function hookIntegrity(home, receipt) {
  const file = hooksPath(home);
  if (!fs.existsSync(file)) return { exists: false, ok: false, locations: [], error: 'CODEX_HOME/hooks.json does not exist.' };
  let document;
  try { document = parseHooksDocument(fs.readFileSync(file, 'utf8')); }
  catch (error) { return { exists: true, ok: false, locations: [], error: error.message }; }
  const locations = managedHookLocations(document);
  const exactHandler = locations.length === 1 && receipt?.hook?.handler
    ? JSON.stringify(locations[0].handler) === JSON.stringify(receipt.hook.handler)
    : false;
  return {
    exists: true,
    ok: locations.length === 1 && exactHandler,
    locations: locations.map(({ event, groupIndex, handlerIndex }) => ({ event, groupIndex, handlerIndex })),
    exactHandler,
    trust: 'Codex-managed; first use may request review'
  };
}

function writeReceipt(home, { mode, codexVersion, roles, hook, runtime, validation }) {
  fs.mkdirSync(stateDir(home), { recursive: true });
  const config = readConfig(home);
  const receipt = {
    schemaVersion: 2,
    packageVersion: PACKAGE_VERSION,
    installedAt: new Date().toISOString(),
    mode,
    backend: mode === 'adaptive'
      ? 'transparent-user-prompt-hook+native-route-specific-agent-roles'
      : 'single-agent-passthrough',
    codexVersion,
    minimumCodexVersion: MIN_CODEX_VERSION,
    testedCodexVersion: TESTED_CODEX_VERSION,
    managedBlockSha256: mode === 'adaptive' ? managedBlockHash(config) : null,
    roles: roles.map(({ agentType, stage, model, effort, filename, sha256: hash }) => ({ agentType, stage, model, effort, filename, sha256: hash })),
    hook: mode === 'adaptive' ? hook : null,
    runtime: mode === 'adaptive' ? runtime : null,
    validation: {
      overallStatus: validation.overallStatus,
      warnings: validation.warnings
    }
  };
  atomicWrite(receiptPath(home), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function validateNativeInstall(home, runner) {
  return probeCodex({ home, runner, checkConfig: true, checkModels: true });
}

function prepareAdaptive(home, existingConfig, existingHooks, receipt) {
  assertBaselineSafe(existingConfig);
  const hooksDocument = parseHooksDocument(existingHooks);
  assertOwnedFileCollisionsSafe(home, existingConfig, receipt);
  assertHookCollisionSafe(hooksDocument, existingConfig, receipt);
  assertRuntimeCollisionSafe(home, receipt);
}

function backupFile(file, suffix) {
  if (!fs.existsSync(file)) return null;
  const backup = `${file}.codex-lattice-backup-${suffix}`;
  fs.copyFileSync(file, backup);
  return backup;
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
  const existingConfig = readConfig(home);
  const existingHooks = readHooks(home);
  const previousReceipt = readReceipt(home);
  if (mode === 'adaptive') prepareAdaptive(home, existingConfig, existingHooks, previousReceipt);
  else if (fs.existsSync(hooksPath(home))) parseHooksDocument(existingHooks);

  const snapshot = snapshotFiles(home, previousReceipt);
  const stamp = Date.now();
  const backups = [backupFile(config, stamp), backupFile(hooksPath(home), stamp)].filter(Boolean);

  try {
    let roles = [];
    let hook = null;
    let runtime = null;
    if (mode === 'adaptive') {
      roles = writeRouteRoles(home);
      runtime = writeHookRuntime(home);
      hook = writeManagedHooks(home, existingHooks, previousReceipt);
      atomicWrite(config, adaptiveConfig(existingConfig));
    } else {
      atomicWrite(config, passthroughConfig(existingConfig));
      removeOwnedRoles(home, receiptRoleFilenames(previousReceipt));
      removeManagedHooks(home, previousReceipt, { allowActiveOwnership: isManagedActive(existingConfig) });
      removeReceiptRuntime(previousReceipt);
    }

    const validation = validateNativeInstall(home, runner);
    if (validation.overallStatus === 'error') throw new Error(validation.errors.join(' '));
    const preservedSupersededRuntimeFiles = mode === 'adaptive'
      ? removeSupersededRuntime(previousReceipt, runtime)
      : [];
    const receipt = writeReceipt(home, { mode, codexVersion: validation.version, roles, hook, runtime, validation });
    return {
      home,
      config,
      hooks: hooksPath(home),
      backups,
      mode,
      transparentRouting: mode === 'adaptive',
      trustReview: mode === 'adaptive' ? 'Codex may request one-time hook review on first launch/use.' : null,
      preservedSupersededRuntimeFiles,
      validation,
      receipt
    };
  } catch (error) {
    restoreSnapshot(snapshot);
    for (const backup of backups) fs.rmSync(backup, { force: true });
    throw new Error(`${error.message} Installation changes were rolled back to the pre-install state.`);
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
  const existingConfig = readConfig(home);
  const existingHooks = readHooks(home);
  const previousReceipt = readReceipt(home);
  if (mode === 'adaptive') prepareAdaptive(home, existingConfig, existingHooks, previousReceipt);
  else if (fs.existsSync(hooksPath(home))) parseHooksDocument(existingHooks);
  const snapshot = snapshotFiles(home, previousReceipt);

  try {
    let roles = [];
    let hook = null;
    let runtime = null;
    if (mode === 'adaptive') {
      roles = writeRouteRoles(home);
      runtime = writeHookRuntime(home);
      hook = writeManagedHooks(home, existingHooks, previousReceipt);
      atomicWrite(config, adaptiveConfig(existingConfig));
    } else {
      atomicWrite(config, passthroughConfig(existingConfig));
      removeOwnedRoles(home, receiptRoleFilenames(previousReceipt));
      removeManagedHooks(home, previousReceipt, { allowActiveOwnership: isManagedActive(existingConfig) });
      removeReceiptRuntime(previousReceipt);
    }
    const validation = validateNativeInstall(home, runner);
    if (validation.overallStatus === 'error') throw new Error(validation.errors.join(' '));
    const preservedSupersededRuntimeFiles = mode === 'adaptive'
      ? removeSupersededRuntime(previousReceipt, runtime)
      : [];
    const receipt = writeReceipt(home, { mode, codexVersion: validation.version, roles, hook, runtime, validation });
    return {
      home,
      config,
      hooks: hooksPath(home),
      mode,
      transparentRouting: mode === 'adaptive',
      trustReview: mode === 'adaptive' ? 'Codex may request one-time hook review on first launch/use.' : null,
      preservedSupersededRuntimeFiles,
      validation,
      receipt
    };
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
  const hook = receipt?.mode === 'adaptive' ? hookIntegrity(home, receipt) : null;
  const runtime = receipt?.mode === 'adaptive' ? runtimeIntegrity(receipt) : [];
  const probe = probeCodex({ home, runner, checkConfig: true, checkModels: true });
  const errors = [...probe.errors];
  const warnings = [...probe.warnings];

  if (!fs.existsSync(config)) errors.push('CODEX_HOME/config.toml does not exist.');
  if (!receipt) errors.push('CodexLattice installation receipt is missing or unreadable; run `codex-lattice install`.');
  if (active) {
    const badRoles = roles.filter((role) => !role.ok);
    if (badRoles.length) errors.push(`${badRoles.length} installed route role file(s) are missing or modified.`);
    if (receipt?.managedBlockSha256 && managedBlockHash(configText) !== receipt.managedBlockSha256) {
      errors.push('The active CodexLattice managed block differs from the validated installation receipt.');
    }
  } else if (receipt?.mode === 'adaptive') {
    errors.push('Receipt says adaptive mode is active, but the managed block is absent.');
  }

  if (receipt?.mode === 'adaptive') {
    if (!receipt.hook || !receipt.runtime) errors.push('Adaptive receipt predates transparent hook integration; run `codex-lattice install` to migrate.');
    else {
      if (!hook?.ok) errors.push(hook?.error || 'CodexLattice UserPromptSubmit hook is missing or modified.');
      const badRuntime = runtime.filter((entry) => !entry.ok);
      if (badRuntime.length) errors.push(`${badRuntime.length} transparent hook runtime file(s) are missing or modified.`);
    }
  }

  if (receipt?.mode === 'single' && active) errors.push('Receipt says single mode, but an adaptive managed block is still active.');

  return {
    overallStatus: errors.length ? 'error' : warnings.length ? 'warning' : 'ok',
    codexHome: home,
    config,
    hooksFile: hooksPath(home),
    configExists: fs.existsSync(config),
    adaptiveActive: active,
    transparentRoutingActive: active && Boolean(receipt?.mode === 'adaptive' && hook?.ok && runtime.every((entry) => entry.ok)),
    hookTrust: receipt?.mode === 'adaptive' ? 'Codex-managed; approve once if Codex presents a hook review prompt.' : null,
    receipt,
    roles: active ? roles : [],
    hook,
    runtime,
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
  if (!isManagedActive(configText)) throw new Error('CodexLattice adaptive mode is not active. Run `codex-lattice install` or `codex-lattice mode adaptive`.');
  const receipt = readReceipt(home);
  if (!receipt || receipt.mode !== 'adaptive') throw new Error('CodexLattice installation receipt is missing/stale. Run `codex-lattice install` to revalidate the installation.');
  if (receipt.packageVersion !== PACKAGE_VERSION) throw new Error(`CodexLattice was installed by version ${receipt.packageVersion || 'unknown'}, but the running CLI is ${PACKAGE_VERSION}. Run \`codex-lattice install\` to revalidate and migrate the native installation.`);
  if (receipt.codexVersion !== base.version) throw new Error(`Codex changed from validated version ${receipt.codexVersion || 'unknown'} to ${base.version}. Run \`codex-lattice install\` to revalidate compatibility before running.`);
  if (receipt.managedBlockSha256 !== managedBlockHash(configText)) throw new Error('CodexLattice managed config has drifted since validation. Run `codex-lattice doctor --strict`, then reinstall adaptive mode.');
  const badRoles = roleIntegrity(home).filter((role) => !role.ok);
  if (badRoles.length) throw new Error(`CodexLattice route role files are missing or modified (${badRoles.length}). Run \`codex-lattice install\` to repair.`);
  return { ready: true, codexVersion: base.version, receipt };
}

export function uninstall({ home = codexHome(), runner = runCodex } = {}) {
  fs.mkdirSync(home, { recursive: true });
  const config = configPath(home);
  const configText = readConfig(home);
  const receipt = readReceipt(home);
  const active = isManagedActive(configText);
  if (fs.existsSync(config)) atomicWrite(config, passthroughConfig(configText));

  const filesToRemove = new Set(receiptRoleFilenames(receipt));
  if (active) {
    for (const filename of roleSpecs().map((spec) => spec.filename)) filesToRemove.add(filename);
  }
  removeOwnedRoles(home, filesToRemove);
  removeManagedHooks(home, receipt, { allowActiveOwnership: active && Boolean(receipt?.hook) });
  const preservedRuntimeFiles = removeReceiptRuntime(receipt);
  if (receipt) fs.rmSync(receiptPath(home), { force: true });

  let validation = null;
  try {
    validation = probeCodex({ home, runner, checkConfig: true, checkModels: false });
  } catch {
    validation = null;
  }
  return { home, config, hooks: hooksPath(home), preservedRuntimeFiles, validation };
}
