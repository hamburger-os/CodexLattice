import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { doctor, install, setMode, uninstall } from '../src/installer.js';
import { HOOK_MARKER, managedHookLocations, parseHooksDocument } from '../src/hooks.js';
import { sha256 } from '../src/roles.js';
import { hooksDisabledCodexRunner, supportedCodexRunner } from './helpers.js';

function withTempHome(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex lattice transparent-'));
  try { return fn(home); }
  finally { fs.rmSync(home, { recursive: true, force: true }); }
}

function readHooks(home) {
  return parseHooksDocument(fs.readFileSync(path.join(home, 'hooks.json'), 'utf8'));
}

function runInstalledHookCommand(home, payload) {
  const handler = managedHookLocations(readHooks(home))[0]?.handler;
  assert.ok(handler, 'missing managed hook handler');
  if (process.platform === 'win32') {
    const command = handler.commandWindows || handler.command_windows || handler.command;
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/D', '/S', '/C', `"${command}"`], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      windowsHide: true,
      windowsVerbatimArguments: true
    });
  }
  return spawnSync('/bin/sh', ['-c', handler.command], {
    input: JSON.stringify(payload),
    encoding: 'utf8'
  });
}

function noExplicitRunRunner(args) {
  if (args.join(' ') === 'exec --help') return { status: 2, stdout: '', stderr: 'exec override surface removed' };
  return supportedCodexRunner(args);
}

function degradedSingleRunner(args) {
  const joined = args.join(' ');
  if (joined === '--version') return { status: 0, stdout: 'codex-cli 0.149.1\n', stderr: '' };
  if (joined === 'features list') return { status: 0, stdout: 'multi_agent stable false\nmulti_agent_v2 stable false\nhooks stable false\n', stderr: '' };
  if (joined === 'exec --help') return { status: 2, stdout: '', stderr: 'exec override surface removed' };
  if (joined === 'debug models --bundled') return { status: 2, stdout: '', stderr: 'model catalog unavailable' };
  return { status: 1, stdout: '', stderr: `unexpected fake codex args: ${joined}` };
}

test('adaptive install creates transparent hook runtime and preserves unrelated hooks', () => withTempHome((home) => {
  const hooks = path.join(home, 'hooks.json');
  fs.writeFileSync(hooks, JSON.stringify({
    hooks: {
      PostToolUse: [{ hooks: [{ type: 'command', command: 'echo user-hook' }] }]
    }
  }, null, 2));

  const result = install('adaptive', { home, runner: supportedCodexRunner });
  const document = readHooks(home);
  assert.equal(document.hooks.PostToolUse[0].hooks[0].command, 'echo user-hook');
  assert.equal(managedHookLocations(document).length, 1);
  assert.match(managedHookLocations(document)[0].handler.command, new RegExp(HOOK_MARKER));
  assert.match(managedHookLocations(document)[0].handler.command, /runtime-manifest\.json/);
  assert.equal(result.receipt.schemaVersion, 2);
  assert.match(result.receipt.backend, /transparent-user-prompt-hook/);
  assert.ok(result.receipt.runtime.files.length >= 7);
  assert.ok(result.receipt.runtime.files.every((entry) => fs.existsSync(entry.file)));
  assert.equal(result.transparentRouting, true);
  assert.equal(result.validation.checks.find((entry) => entry.name === 'transparent_hook_execution')?.ok, true);
}));

test('trusted installed hook command runs from a CODEX_HOME containing spaces', () => withTempHome((home) => {
  install('adaptive', { home, runner: supportedCodexRunner });
  const payload = {
    session_id: 'session-installed-runtime',
    turn_id: 'turn-installed-runtime',
    transcript_path: path.join(home, 'rollout.jsonl'),
    cwd: home,
    hook_event_name: 'UserPromptSubmit',
    model: 'gpt-5.6-luna',
    permission_mode: 'default',
    prompt: 'refactor authentication across multiple modules'
  };
  const child = runInstalledHookCommand(home, payload);

  assert.equal(child.status, 0, child.stderr);
  const output = JSON.parse(child.stdout);
  assert.equal(output.continue, true);
  assert.equal(output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(output.hookSpecificOutput.additionalContext, /root process is a coordinator/i);
}));

test('adaptive installation does not depend on the advanced explicit-run override surface', () => withTempHome((home) => {
  const result = install('adaptive', { home, runner: noExplicitRunRunner });
  assert.equal(result.validation.overallStatus, 'ok');
  assert.equal(result.transparentRouting, true);
}));

test('single mode remains an escape hatch when multi-agent, hooks and explicit-run surfaces are unavailable', () => withTempHome((home) => {
  install('adaptive', { home, runner: supportedCodexRunner });
  const result = setMode('single', { home, runner: degradedSingleRunner });
  assert.equal(result.validation.overallStatus, 'ok');
  assert.equal(result.transparentRouting, false);
  assert.equal(fs.existsSync(path.join(home, 'hooks.json')), false);
  const report = doctor({ home, runner: degradedSingleRunner });
  assert.equal(report.overallStatus, 'ok', JSON.stringify(report));
  assert.equal(report.transparentRoutingActive, false);
}));

test('adaptive reinstall preserves original hooks-file ownership', () => withTempHome((home) => {
  const first = install('adaptive', { home, runner: supportedCodexRunner });
  assert.equal(first.receipt.hook.preexisting, false);

  const second = install('adaptive', { home, runner: supportedCodexRunner });
  assert.equal(second.receipt.hook.preexisting, false);

  uninstall({ home, runner: supportedCodexRunner });
  assert.equal(fs.existsSync(path.join(home, 'hooks.json')), false);
}));

test('adaptive reinstall retires an unchanged superseded runtime receipt', () => withTempHome((home) => {
  const first = install('adaptive', { home, runner: supportedCodexRunner });
  for (const entry of first.receipt.runtime.files) fs.rmSync(entry.file, { force: true });

  const legacyDir = path.join(home, 'codex-lattice', 'runtime', 'legacy-test');
  const legacyFile = path.join(legacyDir, 'legacy.js');
  const legacyContent = 'export const legacy = true;\n';
  fs.mkdirSync(legacyDir, { recursive: true });
  fs.writeFileSync(legacyFile, legacyContent);

  const receiptFile = path.join(home, 'codex-lattice', 'install.json');
  const previous = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  previous.runtime = {
    dir: legacyDir,
    files: [{ filename: 'legacy.js', file: legacyFile, sha256: sha256(legacyContent), mode: 0o644 }]
  };
  fs.writeFileSync(receiptFile, `${JSON.stringify(previous, null, 2)}\n`);

  const next = install('adaptive', { home, runner: supportedCodexRunner });
  assert.equal(fs.existsSync(legacyFile), false);
  assert.deepEqual(next.preservedSupersededRuntimeFiles, []);
  assert.ok(next.receipt.runtime.files.every((entry) => fs.existsSync(entry.file)));
}));

test('adaptive install rejects hooks=false before touching user files', () => withTempHome((home) => {
  const config = path.join(home, 'config.toml');
  const original = '[features]\nhooks = false\n';
  fs.writeFileSync(config, original);
  assert.throws(() => install('adaptive', { home, runner: supportedCodexRunner }), /hooks are explicitly disabled/);
  assert.equal(fs.readFileSync(config, 'utf8'), original);
  assert.equal(fs.existsSync(path.join(home, 'hooks.json')), false);
}));

test('adaptive install rolls back when Codex reports the effective hooks backend disabled', () => withTempHome((home) => {
  const config = path.join(home, 'config.toml');
  const baseline = 'model_reasoning_effort = "medium"\n';
  fs.writeFileSync(config, baseline);

  assert.throws(
    () => install('adaptive', { home, runner: hooksDisabledCodexRunner }),
    /hooks=false.*ordinary prompt routing cannot work/i
  );
  assert.equal(fs.readFileSync(config, 'utf8'), baseline);
  assert.equal(fs.existsSync(path.join(home, 'hooks.json')), false);
  assert.equal(fs.existsSync(path.join(home, 'codex-lattice', 'install.json')), false);
}));

test('malformed preexisting hooks.json aborts without changing config', () => withTempHome((home) => {
  const config = path.join(home, 'config.toml');
  const hooks = path.join(home, 'hooks.json');
  fs.writeFileSync(config, 'model = "baseline"\n');
  fs.writeFileSync(hooks, '{broken');
  assert.throws(() => install('adaptive', { home, runner: supportedCodexRunner }), /not valid JSON/);
  assert.equal(fs.readFileSync(config, 'utf8'), 'model = "baseline"\n');
  assert.equal(fs.readFileSync(hooks, 'utf8'), '{broken');
}));

test('single mode removes only CodexLattice hook and owned runtime', () => withTempHome((home) => {
  const hooks = path.join(home, 'hooks.json');
  fs.writeFileSync(hooks, JSON.stringify({
    hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo user' }] }] }
  }, null, 2));
  const adaptive = install('adaptive', { home, runner: supportedCodexRunner });
  const runtimeFiles = adaptive.receipt.runtime.files.map((entry) => entry.file);

  setMode('single', { home, runner: supportedCodexRunner });

  const document = readHooks(home);
  assert.equal(managedHookLocations(document).length, 0);
  assert.equal(document.hooks.UserPromptSubmit[0].hooks[0].command, 'echo user');
  assert.ok(runtimeFiles.every((file) => !fs.existsSync(file)));
}));

test('doctor detects transparent runtime drift before treating routing as active', () => withTempHome((home) => {
  const result = install('adaptive', { home, runner: supportedCodexRunner });
  fs.appendFileSync(result.receipt.runtime.files[0].file, '// drift\n');
  const report = doctor({ home, runner: supportedCodexRunner });
  assert.equal(report.overallStatus, 'error');
  assert.equal(report.transparentRoutingActive, false);
  assert.match(report.errors.join(' '), /runtime|integrity/i);
  assert.equal(report.nativeProbe.checks.find((entry) => entry.name === 'transparent_hook_execution')?.ok, false);
}));

test('uninstall removes a hooks file created solely by CodexLattice', () => withTempHome((home) => {
  install('adaptive', { home, runner: supportedCodexRunner });
  assert.equal(fs.existsSync(path.join(home, 'hooks.json')), true);
  uninstall({ home, runner: supportedCodexRunner });
  assert.equal(fs.existsSync(path.join(home, 'hooks.json')), false);
}));

test('uninstall preserves unrelated preexisting hooks', () => withTempHome((home) => {
  const hooks = path.join(home, 'hooks.json');
  fs.writeFileSync(hooks, JSON.stringify({
    hooks: { SessionEnd: [{ hooks: [{ type: 'command', command: 'echo keep-me' }] }] }
  }, null, 2));
  install('adaptive', { home, runner: supportedCodexRunner });
  uninstall({ home, runner: supportedCodexRunner });
  const document = readHooks(home);
  assert.equal(document.hooks.SessionEnd[0].hooks[0].command, 'echo keep-me');
  assert.equal(managedHookLocations(document).length, 0);
}));
