import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCodexCompatible,
  assertCodexExplicitRunCompatible,
  compareVersions,
  parseCodexVersion,
  probeCodex
} from '../src/codex.js';
import { oldCodexRunner, supportedCodexRunner } from './helpers.js';

test('Codex version parser accepts CLI version output', () => {
  assert.equal(parseCodexVersion('codex-cli 0.149.1'), '0.149.1');
  assert.equal(compareVersions('0.149.1', '0.149.0'), 1);
});

test('native probe validates runtime flags and active config', () => {
  const result = probeCodex({ home: '/tmp/example', runner: supportedCodexRunner, requireMultiAgent: true });
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

test('Windows Desktop resolver finds the newest versioned executable without PATH', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { windowsDesktopCodexExecutable } = await import('../src/codex.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-desktop-'));
  try {
    const oldExe = path.join(root, 'OpenAI', 'Codex', 'bin', 'old', 'codex.exe');
    const currentExe = path.join(root, 'OpenAI', 'Codex', 'bin', 'current', 'codex.exe');
    fs.mkdirSync(path.dirname(oldExe), { recursive: true });
    fs.mkdirSync(path.dirname(currentExe), { recursive: true });
    fs.writeFileSync(oldExe, 'old');
    fs.writeFileSync(currentExe, 'current');
    fs.utimesSync(oldExe, new Date('2026-01-01'), new Date('2026-01-01'));
    fs.utimesSync(currentExe, new Date('2026-02-01'), new Date('2026-02-01'));
    assert.equal(windowsDesktopCodexExecutable(root), currentExe);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a stale explicit launcher falls back to the Windows Desktop executable', { skip: process.platform !== 'win32' }, async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { resolveCodexInvocation } = await import('../src/codex.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-stale-launcher-'));
  try {
    const desktopExe = path.join(root, 'OpenAI', 'Codex', 'bin', 'current', 'codex.exe');
    fs.mkdirSync(path.dirname(desktopExe), { recursive: true });
    fs.writeFileSync(desktopExe, 'current');
    const result = resolveCodexInvocation({
      env: { LOCALAPPDATA: root, CODEX_LATTICE_CODEX: path.join(root, 'missing', 'codex.js') }
    });
    assert.deepEqual(result, { command: desktopExe, prefixArgs: [], source: 'windows-desktop' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('stable multi_agent=true is sufficient even when multi_agent_v2=false', () => {
  const result = probeCodex({ home: '/tmp/example', runner: supportedCodexRunner, requireMultiAgent: true });
  assert.equal(result.overallStatus, 'ok');
  const check = result.checks.find((item) => item.name === 'multi_agent_backend');
  assert.equal(check?.ok, true);
});

test('adaptive capability probe fails closed when no multi-agent backend is enabled', () => {
  const runner = (args) => {
    if (args.join(' ') === 'features list') {
      return { status: 0, stdout: 'multi_agent stable false\nmulti_agent_v2 stable false\n', stderr: '' };
    }
    return supportedCodexRunner(args);
  };
  const result = probeCodex({ home: '/tmp/example', runner, requireMultiAgent: true, checkModels: false });
  assert.equal(result.overallStatus, 'error');
  assert.match(result.errors.join(' '), /enabled multi-agent backend/);
});

test('base compatibility does not depend on the advanced explicit-run override surface', () => {
  const runner = (args) => {
    if (args.join(' ') === 'exec --help') return { status: 2, stdout: '', stderr: 'removed override flags' };
    return supportedCodexRunner(args);
  };
  assert.doesNotThrow(() => assertCodexCompatible({ runner }));
  assert.throws(() => assertCodexExplicitRunCompatible({ runner }), /explicit `codex-lattice run`/);
});
