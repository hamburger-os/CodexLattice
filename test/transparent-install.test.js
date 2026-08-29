import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { doctor, install, setMode, uninstall } from '../src/installer.js';
import { HOOK_MARKER, managedHookLocations, parseHooksDocument } from '../src/hooks.js';
import { hooksDisabledCodexRunner, supportedCodexRunner } from './helpers.js';

function withTempHome(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-lattice-transparent-'));
  try { return fn(home); }
  finally { fs.rmSync(home, { recursive: true, force: true }); }
}

function readHooks(home) {
  return parseHooksDocument(fs.readFileSync(path.join(home, 'hooks.json'), 'utf8'));
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
  assert.equal(result.receipt.schemaVersion, 2);
  assert.match(result.receipt.backend, /transparent-user-prompt-hook/);
  assert.ok(result.receipt.runtime.files.length >= 8);
  assert.ok(result.receipt.runtime.files.every((entry) => fs.existsSync(entry.file)));
  assert.equal(result.transparentRouting, true);
}));

test('installed self-contained hook runtime executes without resolving the npm package', () => withTempHome((home) => {
  const result = install('adaptive', { home, runner: supportedCodexRunner });
  const runnerFile = result.receipt.runtime.files.find((entry) => entry.filename === 'hook-runner.js')?.file;
  assert.ok(runnerFile);

  const payload = {
    session_id: 'session-installed-runtime',
    turn_id: 'turn-installed-runtime',
    agent_id: null,
    agent_type: null,
    transcript_path: path.join(home, 'rollout.jsonl'),
    cwd: home,
    hook_event_name: 'UserPromptSubmit',
    model: 'gpt-5.6-luna',
    permission_mode: 'default',
    prompt: 'refactor authentication across multiple modules'
  };
  const child = spawnSync(process.execPath, [runnerFile], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    windowsHide: true
  });

  assert.equal(child.status, 0, child.stderr);
  const output = JSON.parse(child.stdout);
  assert.equal(output.continue, true);
  assert.equal(output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(output.hookSpecificOutput.additionalContext, /root process is a coordinator/i);
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

test('doctor detects transparent runtime drift', () => withTempHome((home) => {
  const result = install('adaptive', { home, runner: supportedCodexRunner });
  fs.appendFileSync(result.receipt.runtime.files[0].file, '// drift\n');
  const report = doctor({ home, runner: supportedCodexRunner });
  assert.equal(report.overallStatus, 'error');
  assert.equal(report.transparentRoutingActive, false);
  assert.match(report.errors.join(' '), /runtime file\(s\) are missing or modified/);
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
