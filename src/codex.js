import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const MIN_CODEX_VERSION = '0.149.0';
export const TESTED_CODEX_VERSION = '0.149.1';
const LATTICE_HOOK_MARKER = '--codex-lattice-hook-v1';

function versionTuple(version) {
  const match = String(version || '').match(/(?:^|\s|v)(\d+)\.(\d+)\.(\d+)(?:\D|$)/);
  return match ? match.slice(1, 4).map(Number) : null;
}

export function parseCodexVersion(output) {
  const tuple = versionTuple(output);
  return tuple ? tuple.join('.') : null;
}

export function compareVersions(a, b) {
  const av = versionTuple(a);
  const bv = versionTuple(b);
  if (!av || !bv) return null;
  for (let i = 0; i < 3; i += 1) {
    if (av[i] !== bv[i]) return av[i] < bv[i] ? -1 : 1;
  }
  return 0;
}

export function windowsNpmLauncherFromShim(shimPath) {
  if (!shimPath) return null;
  const candidate = path.join(
    path.dirname(shimPath),
    'node_modules',
    '@openai',
    'codex',
    'bin',
    'codex.js'
  );
  return fs.existsSync(candidate) ? candidate : null;
}

function firstWhere(name) {
  const result = spawnSync('where.exe', [name], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) return null;
  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || null;
}

export function resolveCodexInvocation() {
  const override = process.env.CODEX_LATTICE_CODEX;
  if (override) {
    if (/\.m?js$/i.test(override)) {
      return { command: process.execPath, prefixArgs: [override], source: 'explicit-js-launcher' };
    }
    if (process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(override)) {
      const launcher = windowsNpmLauncherFromShim(override);
      if (!launcher) {
        throw new Error('CODEX_LATTICE_CODEX points to a Windows command shim that cannot be launched safely without a shell. Point it to codex.exe or the @openai/codex bin/codex.js launcher instead.');
      }
      return { command: process.execPath, prefixArgs: [launcher], source: 'explicit-npm-shim' };
    }
    return { command: override, prefixArgs: [], source: 'explicit' };
  }

  if (process.platform === 'win32') {
    const nativeExe = firstWhere('codex.exe');
    if (nativeExe) return { command: nativeExe, prefixArgs: [], source: 'windows-native' };

    const npmShim = firstWhere('codex.cmd');
    const launcher = windowsNpmLauncherFromShim(npmShim);
    if (launcher) {
      // Do not use shell:true here. User task text is eventually passed as an argument to
      // `codex exec`; launching the npm JS entrypoint directly avoids cmd.exe parsing it.
      return { command: process.execPath, prefixArgs: [launcher], source: 'windows-npm-launcher' };
    }

    return { command: 'codex.exe', prefixArgs: [], source: 'windows-unresolved' };
  }

  return { command: 'codex', prefixArgs: [], source: 'path' };
}

export function runCodex(args, { home, cwd = process.cwd(), stdio = 'pipe', env: extraEnv = {} } = {}) {
  const env = { ...process.env, ...extraEnv };
  if (home) env.CODEX_HOME = home;
  let invocation;
  try {
    invocation = resolveCodexInvocation();
  } catch (error) {
    return { status: null, stdout: '', stderr: '', error };
  }
  return spawnSync(invocation.command, [...invocation.prefixArgs, ...args], {
    cwd,
    env,
    stdio,
    encoding: stdio === 'pipe' ? 'utf8' : undefined,
    windowsHide: true
  });
}

function resultText(result) {
  return `${result?.stdout || ''}\n${result?.stderr || ''}`.trim();
}

function runnerFailure(result) {
  if (result?.error) return result.error.message;
  return resultText(result) || `exit ${result?.status ?? 'unknown'}`;
}

function transparentHookInstalled(home) {
  if (!home) return false;
  const file = path.join(home, 'hooks.json');
  if (!fs.existsSync(file)) return false;
  try {
    return fs.readFileSync(file, 'utf8').includes(LATTICE_HOOK_MARKER);
  } catch {
    return false;
  }
}

export function probeCodex({ home, runner = runCodex, checkConfig = true, checkModels = true } = {}) {
  const checks = [];
  const errors = [];
  const warnings = [];

  const versionResult = runner(['--version'], { home });
  const versionText = resultText(versionResult);
  const version = parseCodexVersion(versionText);
  const versionOk = versionResult?.status === 0 && Boolean(version);
  checks.push({ name: 'codex_on_path', ok: versionOk, detail: versionText || runnerFailure(versionResult) });
  if (!versionOk) {
    errors.push('Codex CLI is not available on PATH or did not report a parseable version.');
    return { overallStatus: 'error', version: null, checks, errors, warnings };
  }

  const comparison = compareVersions(version, MIN_CODEX_VERSION);
  const supportedVersion = comparison !== null && comparison >= 0;
  checks.push({ name: 'codex_version', ok: supportedVersion, detail: `${version} (minimum ${MIN_CODEX_VERSION}; tested ${TESTED_CODEX_VERSION})` });
  if (!supportedVersion) errors.push(`Codex ${version} is older than the minimum supported ${MIN_CODEX_VERSION}.`);

  const execHelp = runner(['exec', '--help'], { home });
  const execHelpText = resultText(execHelp);
  const execFlagsOk = execHelp?.status === 0 && /--model\b/.test(execHelpText) && /(?:^|\s)-c\b|--config\b/m.test(execHelpText);
  checks.push({ name: 'exec_runtime_overrides', ok: execFlagsOk, detail: execFlagsOk ? '--model and config override are available' : runnerFailure(execHelp) });
  if (!execFlagsOk) errors.push('This Codex CLI does not expose the runtime --model/config override surface required by the explicit CodexLattice run command.');

  let featuresText = null;
  if (checkConfig && errors.length === 0) {
    const features = runner(['features', 'list'], { home });
    featuresText = resultText(features);
    const configOk = features?.status === 0;
    checks.push({ name: 'native_config_parse', ok: configOk, detail: configOk ? 'codex features list accepted the active CODEX_HOME configuration' : runnerFailure(features) });
    if (!configOk) errors.push('Codex rejected the active configuration after CodexLattice installation.');
    if (configOk) {
      const featureStates = new Map();
      for (const line of featuresText.split(/\r?\n/)) {
        const match = line.trim().match(/^(\S+)\s+.+?\s+(true|false)$/i);
        if (match) featureStates.set(match[1], match[2].toLowerCase() === 'true');
      }
      const multiAgentKeys = ['multi_agent', 'multi_agent_v2'].filter((key) => featureStates.has(key));
      const multiAgentEnabled = multiAgentKeys.some((key) => featureStates.get(key) === true);
      checks.push({
        name: 'multi_agent_backend',
        ok: multiAgentEnabled,
        detail: multiAgentKeys.length
          ? multiAgentKeys.map((key) => `${key}=${featureStates.get(key)}`).join(', ')
          : 'no recognized multi-agent feature key reported'
      });
      if (!multiAgentEnabled) {
        errors.push('Codex does not report an enabled multi-agent backend; adaptive orchestration cannot be guaranteed to work.');
      }

      const requiresHooks = transparentHookInstalled(home);
      if (featureStates.has('hooks')) {
        const hooksEnabled = featureStates.get('hooks') === true;
        checks.push({ name: 'hooks_backend', ok: hooksEnabled, detail: `hooks=${hooksEnabled}` });
        if (!hooksEnabled && requiresHooks) {
          errors.push('Codex reports hooks=false while the CodexLattice transparent hook is installed; ordinary prompt routing cannot work.');
        } else if (!hooksEnabled) {
          warnings.push('Codex reports hooks=false; transparent prompt routing is unavailable in the current configuration.');
        }
      } else {
        checks.push({ name: 'hooks_backend', ok: null, detail: 'hooks feature key was not reported by this Codex build' });
        if (requiresHooks) {
          errors.push('Could not verify an enabled hooks backend while the CodexLattice transparent hook is installed.');
        } else {
          warnings.push('Could not verify the hooks feature from `codex features list`.');
        }
      }
    }
  }

  if (checkModels && errors.length === 0) {
    const models = runner(['debug', 'models', '--bundled'], { home });
    const modelText = resultText(models);
    if (models?.status === 0) {
      const slugs = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'];
      const present = slugs.filter((slug) => modelText.includes(slug));
      checks.push({ name: 'bundled_model_catalog', ok: present.length === slugs.length, detail: present.length === slugs.length ? 'GPT-5.6 Luna/Terra/Sol appear in bundled catalog' : `found ${present.length}/3 GPT-5.6 route models` });
      if (present.length !== slugs.length) warnings.push('The local bundled model catalog did not expose all GPT-5.6 route slugs. Model entitlement/catalog availability must be verified on the target account.');
    } else {
      checks.push({ name: 'bundled_model_catalog', ok: null, detail: 'optional probe unavailable on this Codex build' });
      warnings.push('Could not inspect the bundled model catalog; installation can still be structurally valid, but model availability is not proven.');
    }
  }

  return {
    overallStatus: errors.length ? 'error' : warnings.length ? 'warning' : 'ok',
    version,
    checks,
    errors,
    warnings,
    featuresText
  };
}

export function assertCodexCompatible(options = {}) {
  const probe = probeCodex({ ...options, checkConfig: false, checkModels: false });
  if (probe.overallStatus === 'error') {
    const error = new Error(probe.errors.join(' '));
    error.probe = probe;
    throw error;
  }
  return probe;
}

export function codexInstallHint() {
  return 'Install/update Codex first: `npm install -g @openai/codex` or `brew install --cask codex`, then retry.';
}
