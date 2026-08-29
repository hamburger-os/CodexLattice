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

test('Windows npm shim resolver targets the package JS launcher without a shell', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { windowsNpmLauncherFromShim } = await import('../src/codex.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-win-shim-'));
  try {
    const shim = path.join(root, 'codex.cmd');
    const launcher = path.join(root, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    fs.mkdirSync(path.dirname(launcher), { recursive: true });
    fs.writeFileSync(shim, '@echo off\r\n');
    fs.writeFileSync(launcher, '#!/usr/bin/env node\n');
    assert.equal(windowsNpmLauncherFromShim(shim), launcher);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
