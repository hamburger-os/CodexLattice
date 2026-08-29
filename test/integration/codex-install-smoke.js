import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { roleSpecs } from '../../src/roles.js';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-lattice-real-codex-'));
const cli = path.resolve('bin/codex-lattice.js');

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
  const version = runCli(['version']).stdout.trim();
  assert.equal(version, '0.2.3');

  const installResult = runCli(['install', 'adaptive']);
  const installed = JSON.parse(installResult.stdout);
  assert.notEqual(installed.validation.overallStatus, 'error');

  const config = fs.readFileSync(path.join(home, 'config.toml'), 'utf8');
  assert.match(config, /\[agents\.lattice_plan_sol_high\]/);
  for (const spec of roleSpecs()) {
    assert.ok(fs.existsSync(path.join(home, 'agents', spec.filename)), spec.filename);
  }

  // This exercises the actual CLI's strict post-install validator against the
  // real Codex binary and the exact CODEX_HOME written above.
  const doctor = JSON.parse(runCli(['doctor', '--strict']).stdout);
  assert.equal(doctor.overallStatus, 'ok', JSON.stringify(doctor));

  runCli(['mode', 'single']);
  assert.doesNotMatch(fs.readFileSync(path.join(home, 'config.toml'), 'utf8'), /CodexLattice managed block/);

  runCli(['mode', 'adaptive']);
  assert.match(fs.readFileSync(path.join(home, 'config.toml'), 'utf8'), /CodexLattice managed block/);

  runCli(['uninstall']);
  assert.doesNotMatch(fs.readFileSync(path.join(home, 'config.toml'), 'utf8'), /CodexLattice managed block/);
  console.log('real Codex CLI installation smoke test passed');
} finally {
  fs.rmSync(home, { recursive: true, force: true });
}
