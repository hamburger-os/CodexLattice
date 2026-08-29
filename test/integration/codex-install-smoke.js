import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { doctor, install, setMode, uninstall } from '../../src/installer.js';
import { roleSpecs } from '../../src/roles.js';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-lattice-real-codex-'));
try {
  const installed = install('adaptive', { home });
  assert.notEqual(installed.validation.overallStatus, 'error');
  const config = fs.readFileSync(path.join(home, 'config.toml'), 'utf8');
  assert.match(config, /\[agents\.lattice_plan_sol_high\]/);
  for (const spec of roleSpecs()) assert.ok(fs.existsSync(path.join(home, 'agents', spec.filename)));

  const report = doctor({ home });
  assert.notEqual(report.overallStatus, 'error', JSON.stringify(report.errors));

  setMode('single', { home });
  assert.doesNotMatch(fs.readFileSync(path.join(home, 'config.toml'), 'utf8'), /CodexLattice managed block/);
  setMode('adaptive', { home });
  assert.match(fs.readFileSync(path.join(home, 'config.toml'), 'utf8'), /CodexLattice managed block/);

  uninstall({ home });
  assert.doesNotMatch(fs.readFileSync(path.join(home, 'config.toml'), 'utf8'), /CodexLattice managed block/);
  console.log('real Codex installation smoke test passed');
} finally {
  fs.rmSync(home, { recursive: true, force: true });
}
