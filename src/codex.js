import { spawnSync } from 'node:child_process';

export const MIN_CODEX_VERSION = '0.149.0';
export const TESTED_CODEX_VERSION = '0.149.1';

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

export function runCodex(args, { home, cwd = process.cwd(), stdio = 'pipe' } = {}) {
  const env = { ...process.env };
  if (home) env.CODEX_HOME = home;
  return spawnSync(process.env.CODEX_LATTICE_CODEX || 'codex', args, {
    cwd,
    env,
    stdio,
    encoding: stdio === 'pipe' ? 'utf8' : undefined
  });
}

function resultText(result) {
  return `${result?.stdout || ''}\n${result?.stderr || ''}`.trim();
}

function runnerFailure(result) {
  if (result?.error) return result.error.message;
  return resultText(result) || `exit ${result?.status ?? 'unknown'}`;
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
  if (!execFlagsOk) errors.push('This Codex CLI does not expose the runtime --model/config override surface required by CodexLattice.');

  let featuresText = null;
  if (checkConfig && errors.length === 0) {
    const features = runner(['features', 'list'], { home });
    featuresText = resultText(features);
    const configOk = features?.status === 0;
    checks.push({ name: 'native_config_parse', ok: configOk, detail: configOk ? 'codex features list accepted the active CODEX_HOME configuration' : runnerFailure(features) });
    if (!configOk) errors.push('Codex rejected the active configuration after CodexLattice installation.');
    if (configOk && /multi[_-]?agent[^\n]*(?:false|disabled|off)/i.test(featuresText)) {
      warnings.push('Codex reports a multi-agent feature as disabled; adaptive subagents may not be available until that feature is enabled in this Codex build/account.');
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
