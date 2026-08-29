import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUCKETS, codexArgsForRunner, readJson, resolveInside, restoreProtectedFiles, runnerPlan, summarizeResults, validateCorpus, validateRunners } from '../scripts/eval-lib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const corpus = readJson(path.join(repoRoot, 'eval', 'tasks.json'));
const runners = readJson(path.join(repoRoot, 'eval', 'runners.json'));

test('evaluation corpus has two seed tasks in every difficulty bucket', () => {
  const summary = validateCorpus(corpus);
  assert.equal(summary.taskCount, 8);
  assert.deepEqual(BUCKETS.map((bucket) => summary.counts[bucket]), [2, 2, 2, 2]);
});

test('evaluation runner matrix matches the published baselines', () => {
  validateRunners(runners);
  assert.deepEqual(runners.runners, [
    { id: 'adaptive', kind: 'lattice' },
    { id: 'sol-medium', kind: 'codex', model: 'gpt-5.6-sol', effort: 'medium' },
    { id: 'sol-high', kind: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    { id: 'terra-medium', kind: 'codex', model: 'gpt-5.6-terra', effort: 'medium' }
  ]);
});

test('task materialization rejects path traversal', () => {
  assert.throws(() => resolveInside('/tmp/workspace', '../escape.txt'), /traversal|escapes/i);
  assert.throws(() => resolveInside('/tmp/workspace', path.resolve('/tmp/escape.txt')), /absolute/i);
});

test('protected evaluator files are restored after a runner modifies them', () => {
  const task = corpus.tasks[0];
  const workspace = path.join(process.cwd(), `.eval-test-${process.pid}-${Date.now()}`);
  try {
    fs.mkdirSync(workspace, { recursive: true });
    for (const [relative, content] of Object.entries(task.files)) fs.writeFileSync(path.join(workspace, relative), content, 'utf8');
    fs.writeFileSync(path.join(workspace, 'test.js'), 'tampered', 'utf8');
    assert.deepEqual(restoreProtectedFiles(task, workspace), ['test.js']);
    assert.equal(fs.readFileSync(path.join(workspace, 'test.js'), 'utf8'), task.files['test.js']);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('fixed Codex runner pins model and reasoning effort', () => {
  const runner = runners.runners.find((candidate) => candidate.id === 'sol-high');
  assert.deepEqual(codexArgsForRunner(runner, 'task text'), ['exec', '--model', 'gpt-5.6-sol', '-c', 'model_reasoning_effort="high"', 'task text']);
});

test('adaptive plan goes through the CodexLattice CLI', () => {
  const runner = runners.runners.find((candidate) => candidate.id === 'adaptive');
  const plan = runnerPlan(runner, 'task text', { repoRoot: '/repo' });
  assert.equal(plan.kind, 'lattice');
  assert.equal(plan.command, process.execPath);
  assert.deepEqual(plan.args, [path.join('/repo', 'bin', 'codex-lattice.js'), 'run', 'task text']);
});

test('result summary reports pass rate and missing usage without estimating it', () => {
  const rows = summarizeResults([
    { runnerId: 'adaptive', bucket: 'easy', durationMs: 100, checker: { passed: true }, usage: null, outcome: { score: 4 } },
    { runnerId: 'adaptive', bucket: 'easy', durationMs: 300, checker: { passed: false }, usage: { inputTokens: 10, outputTokens: 5, reasoningTokens: null, costUsd: 0.1 }, outcome: { score: 2 } }
  ]);
  const easy = rows.find((row) => row.runnerId === 'adaptive' && row.bucket === 'easy');
  assert.equal(easy.trials, 2);
  assert.equal(easy.passRate, 0.5);
  assert.equal(easy.medianDurationMs, 200);
  assert.equal(easy.meanScore, 3);
  assert.equal(easy.usageAvailableTrials, 1);
  assert.equal(easy.inputTokens, 10);
  assert.equal(easy.outputTokens, 5);
  assert.equal(easy.reasoningTokens, null);
  assert.equal(easy.costUsd, 0.1);
});
