import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  HOOK_MARKER,
  hookCommands,
  hookRuntimeAssets,
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

  const installed = withManagedHook(original, '/tmp/codex-home', '0.3.0');
  const locations = managedHookLocations(installed);
  assert.equal(locations.length, 1);
  assert.equal(installed.hooks.PostToolUse[0].hooks[0].command, 'echo user');
  assert.equal(installed.hooks.UserPromptSubmit[0].hooks[0].command, 'echo existing');

  const removed = withoutManagedHook(installed);
  assert.deepEqual(removed, original);
});

test('reinstall replaces rather than duplicates the managed hook', () => {
  const first = withManagedHook({ hooks: {} }, '/tmp/codex-home', '0.3.0');
  const second = withManagedHook(first, '/tmp/codex-home', '0.3.0');
  assert.equal(managedHookLocations(second).length, 1);
});

test('hook commands use versioned CODEX_HOME launchers and a stable ownership marker', () => {
  const commands = hookCommands(path.join('/tmp', 'codex home'), '0.3.0');
  assert.match(commands.command, /codex-lattice.*runtime.*0\.3\.0.*hook/);
  assert.match(commands.command, new RegExp(HOOK_MARKER));
  assert.match(commands.commandWindows, /hook\.cmd/);
  assert.match(commands.commandWindows, new RegExp(HOOK_MARKER));
});

test('hook runtime is self-contained and does not depend on npm PATH', () => {
  const assets = hookRuntimeAssets('/tmp/codex-home', '0.3.0', { nodePath: '/opt/node/bin/node' });
  const byName = new Map(assets.map((asset) => [asset.filename, asset]));
  for (const name of ['policy.js', 'roles.js', 'coordinator.js', 'hook.js', 'package.json', 'hook-runner.js', 'hook', 'hook.cmd']) {
    assert.ok(byName.has(name), `missing runtime asset ${name}`);
  }
  assert.match(byName.get('hook').content, /\/opt\/node\/bin\/node/);
  assert.match(byName.get('hook.cmd').content, /\/opt\/node\/bin\/node/);
  assert.equal(byName.get('hook').mode, 0o755);
});

test('malformed hooks document is rejected before mutation helpers run', () => {
  assert.throws(() => parseHooksDocument('{broken'), /not valid JSON/);
  assert.throws(() => parseHooksDocument('{"hooks":{"UserPromptSubmit":{}}}'), /must be an array/);
});
