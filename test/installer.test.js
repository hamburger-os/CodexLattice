import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertReadyForRun,
  doctor,
  install,
  setMode,
  uninstall
} from '../src/installer.js';
import { roleSpecs } from '../src/roles.js';
import { configRejectingRunner, oldCodexRunner, supportedCodexRunner } from './helpers.js';

function withTempHome(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-lattice-'));
  try { return fn(home); }
  finally { fs.rmSync(home, { recursive: true, force: true }); }
}

test('adaptive install coexists with unrelated existing agent tables', () => withTempHome((home) => {
  const config = path.join(home, 'config.toml');
  fs.writeFileSync(config, 'model = "custom"\n\n[agents.custom]\ndescription = "existing"\n');
  const result = install('adaptive', { home, runner: supportedCodexRunner });
  const text = fs.readFileSync(config, 'utf8');
  assert.match(text, /\[agents\.custom\]/);
  assert.match(text, /\[agents\.lattice_plan_sol_high\]/);
  assert.equal(result.validation.overallStatus, 'ok');
}));

test('adaptive install refuses an explicitly disabled multi-agent configuration without mutation', () => withTempHome((home) => {
  const config = path.join(home, 'config.toml');
  const original = '[agents]\nenabled = false\n';
  fs.writeFileSync(config, original);
  assert.throws(() => install('adaptive', { home, runner: supportedCodexRunner }), /explicitly disabled/);
  assert.equal(fs.readFileSync(config, 'utf8'), original);
}));

test('fresh install refuses unowned CodexLattice-namespaced role files', () => withTempHome((home) => {
  const dir = path.join(home, 'agents');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, roleSpecs()[0].filename);
  fs.writeFileSync(file, 'user data\n');
  assert.throws(() => install('adaptive', { home, runner: supportedCodexRunner }), /not associated with a validated installation/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'user data\n');
}));

test('old Codex version fails before writing config or agents', () => withTempHome((home) => {
  const config = path.join(home, 'config.toml');
  fs.writeFileSync(config, 'model = "baseline"\n');
  assert.throws(() => install('adaptive', { home, runner: oldCodexRunner }), /older than/);
  assert.equal(fs.readFileSync(config, 'utf8'), 'model = "baseline"\n');
  assert.equal(fs.existsSync(path.join(home, 'agents')), false);
}));

test('native Codex config rejection rolls installation back', () => withTempHome((home) => {
  const config = path.join(home, 'config.toml');
  const original = 'model = "baseline"\n';
  fs.writeFileSync(config, original);
  assert.throws(() => install('adaptive', { home, runner: configRejectingRunner }), /rolled back/);
  assert.equal(fs.readFileSync(config, 'utf8'), original);
  for (const spec of roleSpecs()) assert.equal(fs.existsSync(path.join(home, 'agents', spec.filename)), false);
}));

test('single mode restores baseline and removes registered role files', () => withTempHome((home) => {
  const config = path.join(home, 'config.toml');
  fs.writeFileSync(config, 'model = "custom-model"\n');
  install('adaptive', { home, runner: supportedCodexRunner });
  setMode('single', { home, runner: supportedCodexRunner });
  assert.equal(fs.readFileSync(config, 'utf8'), 'model = "custom-model"\n');
  for (const spec of roleSpecs()) assert.equal(fs.existsSync(path.join(home, 'agents', spec.filename)), false);
}));

test('doctor proves managed block, receipt, native parse and role integrity', () => withTempHome((home) => {
  install('adaptive', { home, runner: supportedCodexRunner });
  const report = doctor({ home, runner: supportedCodexRunner });
  assert.equal(report.overallStatus, 'ok');
  assert.equal(report.adaptiveActive, true);
  assert.equal(report.roles.length, roleSpecs().length);
  assert.ok(report.roles.every((role) => role.ok));
}));

test('run preflight rejects role drift instead of silently running', () => withTempHome((home) => {
  install('adaptive', { home, runner: supportedCodexRunner });
  const spec = roleSpecs()[0];
  fs.appendFileSync(path.join(home, 'agents', spec.filename), '# drift\n');
  assert.throws(() => assertReadyForRun({ home, runner: supportedCodexRunner }), /missing or modified/);
}));

test('uninstall removes only CodexLattice config and roles', () => withTempHome((home) => {
  const config = path.join(home, 'config.toml');
  fs.writeFileSync(config, 'model = "custom-model"\n');
  install('adaptive', { home, runner: supportedCodexRunner });
  uninstall({ home, runner: supportedCodexRunner });
  assert.equal(fs.readFileSync(config, 'utf8'), 'model = "custom-model"\n');
  for (const spec of roleSpecs()) assert.equal(fs.existsSync(path.join(home, 'agents', spec.filename)), false);
}));

test('run preflight requires revalidation after Codex version changes', () => withTempHome((home) => {
  install('adaptive', { home, runner: supportedCodexRunner });
  const newerRunner = (args) => {
    if (args.join(' ') === '--version') return { status: 0, stdout: 'codex-cli 0.150.0\n', stderr: '' };
    return supportedCodexRunner(args);
  };
  assert.throws(() => assertReadyForRun({ home, runner: newerRunner }), /Codex changed from validated version/);
}));
