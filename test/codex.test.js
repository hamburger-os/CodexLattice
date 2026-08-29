import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, parseCodexVersion, probeCodex } from '../src/codex.js';
import { oldCodexRunner, supportedCodexRunner } from './helpers.js';

test('Codex version parser accepts CLI version output', () => {
  assert.equal(parseCodexVersion('codex-cli 0.149.1'), '0.149.1');
  assert.equal(compareVersions('0.149.1', '0.149.0'), 1);
});

test('native probe validates runtime flags and active config', () => {
  const result = probeCodex({ home: '/tmp/example', runner: supportedCodexRunner });
  assert.equal(result.overallStatus, 'ok');
  assert.equal(result.version, '0.149.1');
  assert.ok(result.checks.some((check) => check.name === 'native_config_parse' && check.ok));
});

test('old Codex is rejected', () => {
  const result = probeCodex({ runner: oldCodexRunner, checkConfig: false, checkModels: false });
  assert.equal(result.overallStatus, 'error');
  assert.match(result.errors.join(' '), /older than/);
});
