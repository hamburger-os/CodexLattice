import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HOOK_MARKER, managedHookLocations, parseHooksDocument } from '../../src/hooks.js';
import { roleSpecs } from '../../src/roles.js';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-lattice-real-codex-'));
const packageVersion = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

function installedCliPath() {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['root', '-g'], { encoding: 'utf8', windowsHide: true });
  if (result.status === 0) {
    const candidate = path.join(String(result.stdout || '').trim(), 'codex-lattice', 'bin', 'codex-lattice.js');
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.resolve('bin/codex-lattice.js');
}

const cli = installedCliPath();

function runCli(args, { expect = 0 } = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    env: { ...process.env, CODEX_HOME: home },
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== expect) {
    throw new Error(
      `codex-lattice ${args.join(' ')} exited ${result.status}\nSTDOUT:\n${result.stdout || ''}\nSTDERR:\n${result.stderr || ''}`
    );
  }
  return result;
}

try {
  const baseline = 'model_reasoning_effort = "medium"\n';
  fs.writeFileSync(path.join(home, 'config.toml'), baseline);

  const version = runCli(['version']).stdout.trim();
  assert.equal(version, packageVersion);

  const installResult = runCli(['install', 'adaptive']);
  const installed = JSON.parse(installResult.stdout);
  assert.notEqual(installed.validation.overallStatus, 'error');
  assert.equal(installed.receipt.packageVersion, packageVersion);
  assert.equal(installed.receipt.schemaVersion, 2);
  assert.equal(installed.transparentRouting, true);

  const config = fs.readFileSync(path.join(home, 'config.toml'), 'utf8');
  assert.match(config, /\[agents\.lattice_plan_sol_high\]/);
  for (const spec of roleSpecs()) {
    assert.ok(fs.existsSync(path.join(home, 'agents', spec.filename)), spec.filename);
  }

  const hooksFile = path.join(home, 'hooks.json');
  assert.equal(fs.existsSync(hooksFile), true);
  const hooks = parseHooksDocument(fs.readFileSync(hooksFile, 'utf8'));
  assert.equal(managedHookLocations(hooks).length, 1);
  assert.match(managedHookLocations(hooks)[0].handler.command, new RegExp(HOOK_MARKER));
  assert.ok(installed.receipt.runtime.files.every((entry) => fs.existsSync(entry.file)));

  // This exercises the actual CLI's strict post-install validator against the
  // real Codex binary and the exact CODEX_HOME written above.
  const doctor = JSON.parse(runCli(['doctor', '--strict']).stdout);
  assert.equal(doctor.overallStatus, 'ok', JSON.stringify(doctor));
  assert.equal(doctor.receipt.packageVersion, packageVersion);
  assert.equal(doctor.transparentRoutingActive, true);
  assert.equal(doctor.nativeProbe.checks.find((check) => check.name === 'multi_agent_backend')?.ok, true);
  assert.equal(doctor.nativeProbe.checks.find((check) => check.name === 'hooks_backend')?.ok, true);
  assert.equal(doctor.nativeProbe.checks.find((check) => check.name === 'bundled_model_catalog')?.ok, true);

  runCli(['mode', 'single']);
  assert.equal(fs.readFileSync(path.join(home, 'config.toml'), 'utf8'), baseline);
  assert.equal(fs.existsSync(hooksFile), false);
  const singleDoctor = JSON.parse(runCli(['doctor', '--strict']).stdout);
  assert.equal(singleDoctor.overallStatus, 'ok', JSON.stringify(singleDoctor));
  assert.equal(singleDoctor.adaptiveActive, false);
  assert.equal(singleDoctor.transparentRoutingActive, false);
  assert.equal(singleDoctor.receipt.packageVersion, packageVersion);

  const reenable = JSON.parse(runCli(['mode', 'adaptive']).stdout);
  assert.match(fs.readFileSync(path.join(home, 'config.toml'), 'utf8'), /CodexLattice managed block/);
  assert.equal(fs.existsSync(hooksFile), true);
  assert.ok(reenable.receipt.runtime.files.every((entry) => fs.existsSync(entry.file)));
  const adaptiveDoctor = JSON.parse(runCli(['doctor', '--strict']).stdout);
  assert.equal(adaptiveDoctor.overallStatus, 'ok', JSON.stringify(adaptiveDoctor));
  assert.equal(adaptiveDoctor.transparentRoutingActive, true);
  assert.equal(adaptiveDoctor.receipt.packageVersion, packageVersion);

  const uninstallResult = JSON.parse(runCli(['uninstall']).stdout);
  assert.notEqual(uninstallResult.validation?.overallStatus, 'error');
  assert.equal(fs.readFileSync(path.join(home, 'config.toml'), 'utf8'), baseline);
  assert.equal(fs.existsSync(hooksFile), false);
  for (const spec of roleSpecs()) {
    assert.equal(fs.existsSync(path.join(home, 'agents', spec.filename)), false, spec.filename);
  }
  assert.equal(fs.existsSync(path.join(home, 'codex-lattice', 'install.json')), false);
  console.log('real Codex CLI transparent installation smoke test passed');
} finally {
  fs.rmSync(home, { recursive: true, force: true });
}
