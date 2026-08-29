import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  appendTelemetry,
  readTelemetry,
  setTelemetry,
  summarizeTelemetry,
  taskIdentity,
  telemetryStatus
} from '../src/telemetry.js';

function withTempHome(fn) {
  const previous = process.env.CODEX_HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-lattice-telemetry-'));
  process.env.CODEX_HOME = home;
  try { return fn(home); }
  finally {
    if (previous === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test('telemetry is opt-in and local-only', () => withTempHome(() => {
  assert.equal(telemetryStatus().enabled, false);
  assert.equal(appendTelemetry('test', { secret: 'not-written' }), false);
  assert.equal(readTelemetry().length, 0);
}));

test('task identity hashes task text instead of storing it', () => {
  const identity = taskIdentity('private task text');
  assert.equal(identity.taskLength, 17);
  assert.equal(identity.taskHash.length, 20);
  assert.equal(Object.values(identity).includes('private task text'), false);
});

test('telemetry summary separates execution signals from feedback labels', () => withTempHome(() => {
  setTelemetry(true);
  appendTelemetry('run_started', {
    runId: 'run-1',
    taskHash: 'abc',
    taskLength: 10,
    executeRoute: { model: 'gpt-5.6-terra', effort: 'medium' }
  });
  appendTelemetry('run_finished', { runId: 'run-1', exitCode: 0, elapsedMs: 120 });
  appendTelemetry('feedback', { runId: 'run-1', label: 'pass' });
  const summary = summarizeTelemetry();
  assert.equal(summary.runsStarted, 1);
  assert.equal(summary.runsFinished, 1);
  assert.equal(summary.feedbackLabels.pass, 1);
  assert.equal(summary.executeRouteCounts['gpt-5.6-terra:medium'], 1);
}));
