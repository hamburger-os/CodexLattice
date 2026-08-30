import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  HOOK_MARKER,
  hookCommands,
  hookRuntimeAssets,
  hookRuntimeBundle,
  managedHookLocations,
  parseHooksDocument,
  withManagedHook,
  withoutManagedHook
} from '../src/hooks.js';

test('managed UserPromptSubmit hook coexists with unrelated hooks', () => {
  const original = parseHooksDocument(JSON.stringify({
    description: 'user hooks',
    hooks: {
      PostToolUse: [{ matcher: 'shell', hooks: [{ type: 'command', command: 'echo user' }] }],
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo existing' }] }]
    }
  }));

  const installed = withManagedHook(original, '/tmp/codex-home', '0.3.1');
  const locations = managedHookLocations(installed);
  assert.equal(locations.length, 1);
  assert.equal(installed.hooks.PostToolUse[0].hooks[0].command, 'echo user');
  assert.equal(installed.hooks.UserPromptSubmit[0].hooks[0].command, 'echo existing');

  const removed = withoutManagedHook(installed);
  assert.deepEqual(removed, original);
});

test('reinstall replaces rather than duplicates the managed hook', () => {
  const first = withManagedHook({ hooks: {} }, '/tmp/codex-home', '0.3.1');
  const second = withManagedHook(first, '/tmp/codex-home', '0.3.1');
  assert.equal(managedHookLocations(second).length, 1);
});

test('hook commands pin Node and bind the trusted command to a versioned runtime manifest digest', () => {
  const home = path.join('/tmp', 'codex home');
  const runtime = hookRuntimeBundle(home, '0.3.1', { nodePath: '/opt/node/bin/node' });
  const commands = hookCommands(home, '0.3.1', runtime);
  assert.match(commands.command, /\/opt\/node\/bin\/node/);
  assert.match(commands.command, /runtime-manifest\.json/);
  assert.match(commands.command, new RegExp(runtime.manifestSha256));
  assert.match(commands.command, new RegExp(HOOK_MARKER));
  assert.match(commands.commandWindows, /runtime-manifest\.json/);
  assert.match(commands.commandWindows, new RegExp(runtime.manifestSha256));
  assert.match(commands.commandWindows, new RegExp(HOOK_MARKER));
});

test('hook runtime is self-contained and manifest hashes every executable runtime file', () => {
  const assets = hookRuntimeAssets('/tmp/codex-home', '0.3.1', { nodePath: '/opt/node/bin/node' });
  const byName = new Map(assets.map((asset) => [asset.filename, asset]));
  for (const name of ['policy.js', 'roles.js', 'coordinator.js', 'hook.js', 'package.json', 'hook-runner.js', 'runtime-manifest.json']) {
    assert.ok(byName.has(name), `missing runtime asset ${name}`);
  }
  const manifest = JSON.parse(byName.get('runtime-manifest.json').content);
  assert.equal(manifest.nodeExecutable, '/opt/node/bin/node');
  assert.match(manifest.runner, /hook-runner\.js$/);
  assert.equal(manifest.files.length, 6);
  assert.deepEqual(
    new Set(manifest.files.map((entry) => entry.filename)),
    new Set(['policy.js', 'roles.js', 'coordinator.js', 'hook.js', 'package.json', 'hook-runner.js'])
  );
  assert.ok(manifest.files.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)));
});

test('malformed hooks document is rejected before mutation helpers run', () => {
  assert.throws(() => parseHooksDocument('{broken'), /not valid JSON/);
  assert.throws(() => parseHooksDocument('{"hooks":{"UserPromptSubmit":{}}}'), /must be an array/);
});
