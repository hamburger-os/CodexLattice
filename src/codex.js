import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { managedHookHandler, managedHookLocations, parseHooksDocument } from './hooks.js';

export const MIN_CODEX_VERSION = '0.149.0';
export const TESTED_CODEX_VERSION = '0.149.1';
const LATTICE_HOOK_MARKER = '--codex-lattice-hook-v1';
const PACKAGE_VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

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

function executeTrustedTransparentHookProbe(home) {
  const hooksFile = path.join(home, 'hooks.json');
  if (!fs.existsSync(hooksFile)) return { ok: false, detail: 'hooks.json is missing' };

  let document;
  try {
    document = parseHooksDocument(fs.readFileSync(hooksFile, 'utf8'));
  } catch (error) {
    return { ok: false, detail: error.message };
  }
  const locations = managedHookLocations(document);
  if (locations.length !== 1) return { ok: false, detail: `expected exactly one managed hook, found ${locations.length}` };

  const actual = locations[0].handler;
  const expected = managedHookHandler(home, PACKAGE_VERSION);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return { ok: false, detail: 'managed hook command does not match the current package/runtime manifest; reinstall CodexLattice' };
  }

  const payload = {
    session_id: 'codex-lattice-doctor',
    turn_id: 'transparent-runtime-probe',
    transcript_path: path.join(home, 'codex-lattice', 'doctor-runtime-probe.jsonl'),
    cwd: home,
    hook_event_name: 'UserPromptSubmit',
    model: 'gpt-5.6-luna',
    permission_mode: 'default',
    prompt: 'codex-lattice doctor transparent runtime probe'
  };
  const input = JSON.stringify(payload);
  let result;
  if (process.platform === 'win32') {
    const command = actual.commandWindows || actual.command_windows || actual.command;
    result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/D', '/S', '/C', `"${command}"`], {
      input,
      encoding: 'utf8',
      windowsHide: true,
      windowsVerbatimArguments: true
    });
  } else {
    result = spawnSync('/bin/sh', ['-c', actual.command], { input, encoding: 'utf8' });
  }
  if (result.error) return { ok: false, detail: result.error.message };
  if (result.status !== 0) return { ok: false, detail: resultText(result) || `exit ${result.status}` };

  try {
    const output = JSON.parse(String(result.stdout || '').trim());
    const ok = output?.continue === true && output?.hookSpecificOutput?.hookEventName === 'UserPromptSubmit';
    return {
      ok,
      detail: ok ? 'trusted managed hook executed and returned routing context' : (resultText(result) || 'hook returned fail-open output without routing context')
    };
  } catch (error) {
    return { ok: false, detail: `hook returned invalid JSON: ${error.message}; ${resultText(result)}` };
  }
}

export function probeCodex({
  home,
  runner = runCodex,
  checkConfig = true,
  checkModels = true,
  checkExplicitRun = false,
  requireMultiAgent = transparentHookInstalled(home),
  requireHooks = transparentHookInstalled(home),
  checkTransparentRuntime = requireHooks
} = {}) {
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

  if (checkExplicitRun) {
    const execHelp = runner(['exec', '--help'], { home });
    const execHelpText = resultText(execHelp);
    const execFlagsOk = execHelp?.status === 0 && /--model\b/.test(execHelpText) && /(?:^|\s)-c\b|--config\b/m.test(execHelpText);
    checks.push({ name: 'explicit_run_overrides', ok: execFlagsOk, detail: execFlagsOk ? '--model and config override are available' : runnerFailure(execHelp) });
    if (!execFlagsOk) errors.push('This Codex CLI does not expose the runtime --model/config override surface required by the explicit `codex-lattice run` command.');
  }

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
        ok: multiAgentKeys.length ? multiAgentEnabled : null,
        required: Boolean(requireMultiAgent),
        detail: multiAgentKeys.length
          ? multiAgentKeys.map((key) => `${key}=${featureStates.get(key)}`).join(', ')
          : 'no recognized multi-agent feature key reported'
      });
      if (requireMultiAgent && !multiAgentEnabled) {
        errors.push('Codex does not report an enabled multi-agent backend; adaptive orchestration cannot be guaranteed to work.');
      }

      if (featureStates.has('hooks')) {
        const hooksEnabled = featureStates.get('hooks') === true;
        checks.push({ name: 'hooks_backend', ok: hooksEnabled, required: Boolean(requireHooks), detail: `hooks=${hooksEnabled}` });
        if (requireHooks && !hooksEnabled) {
          errors.push('Codex reports hooks=false while transparent CodexLattice routing is required; ordinary prompt routing cannot work.');
        }
      } else {
        checks.push({ name: 'hooks_backend', ok: null, required: Boolean(requireHooks), detail: 'hooks feature key was not reported by this Codex build' });
        if (requireHooks) {
          errors.push('Could not verify an enabled hooks backend while transparent CodexLattice routing is required.');
        }
      }
    }
  }

  if (checkTransparentRuntime && requireHooks && errors.length === 0) {
    const runtime = executeTrustedTransparentHookProbe(home);
    checks.push({ name: 'transparent_hook_execution', ok: runtime.ok, required: true, detail: runtime.detail });
    if (!runtime.ok) errors.push(`The installed transparent hook runtime did not pass an execution/integrity probe: ${runtime.detail}`);
  }

  if (checkModels && requireMultiAgent && errors.length === 0) {
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
  const probe = probeCodex({
    ...options,
    checkConfig: false,
    checkModels: false,
    checkExplicitRun: false,
    requireMultiAgent: false,
    requireHooks: false,
    checkTransparentRuntime: false
  });
  if (probe.overallStatus === 'error') {
    const error = new Error(probe.errors.join(' '));
    error.probe = probe;
    throw error;
  }
  return probe;
}

export function assertCodexExplicitRunCompatible(options = {}) {
  const probe = probeCodex({
    ...options,
    checkConfig: false,
    checkModels: false,
    checkExplicitRun: true,
    requireMultiAgent: false,
    requireHooks: false,
    checkTransparentRuntime: false
  });
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
