import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStudyPlan, promotionDecision, sanitizeEvidence, seededOrder, validateStudy, wilsonInterval } from '../scripts/evidence-lib.mjs';
import { readJson } from '../scripts/eval-lib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const corpus = readJson(path.join(repoRoot, 'eval', 'tasks.json'));
const runners = readJson(path.join(repoRoot, 'eval', 'runners.json'));
const study = readJson(path.join(repoRoot, 'eval', 'study.json'));

function result(task, runnerId, trial, { passed = true, score = 4, reasoningTokens = 90 } = {}) {
  return {
    schemaVersion: '1',
    corpusVersion: corpus.version,
    runnerConfigVersion: runners.version,
    runId: `${task.id}-${runnerId}-t${trial}`,
    taskId: task.id,
    bucket: task.bucket,
    runnerId,
    trial,
    startedAt: '2026-01-01T00:00:00.000Z',
    durationMs: 100,
    execution: { exitCode: 0, timedOut: false, error: null },
    checker: { passed, exitCode: passed ? 0 : 1, timedOut: false, durationMs: 10 },
    evaluator: { protectedFilesChanged: [] },
    environment: { node: process.version, codex: 'codex-cli 0.149.1', codexLattice: 'test', platform: process.platform, arch: process.arch },
    usage: { inputTokens: null, outputTokens: null, reasoningTokens, costUsd: null },
    routes: null,
    outcome: { score, humanLabel: null, notes: null },
    artifacts: { stdout: 'eval/artifacts/x/stdout.txt', stderr: 'eval/artifacts/x/stderr.txt', workspace: 'eval/artifacts/x/workspace' }
  };
}

test('study config freezes a balanced calibration/holdout split', () => {
  const summary = validateStudy(study, corpus, runners);
  assert.equal(summary.calibrationTasks, 4);
  assert.equal(summary.holdoutTasks, 4);
  for (const bucket of ['easy', 'medium', 'hard', 'critical']) {
    const calibration = corpus.tasks.filter((task) => task.bucket === bucket && study.splits.calibration.includes(task.id));
    const holdout = corpus.tasks.filter((task) => task.bucket === bucket && study.splits.holdout.includes(task.id));
    assert.equal(calibration.length, 1);
    assert.equal(holdout.length, 1);
  }
});

test('seeded paired order is deterministic and covers every task/runner/trial exactly once', () => {
  const first = buildStudyPlan(study, corpus.tasks, runners.runners, 2);
  const second = buildStudyPlan(study, corpus.tasks, runners.runners, 2);
  assert.deepEqual(first.map((entry) => `${entry.task.id}:${entry.trial}:${entry.runner.id}`), second.map((entry) => `${entry.task.id}:${entry.trial}:${entry.runner.id}`));
  assert.equal(first.length, corpus.tasks.length * runners.runners.length * 2);
  assert.equal(new Set(first.map((entry) => `${entry.task.id}:${entry.trial}:${entry.runner.id}`)).size, first.length);
  assert.notDeepEqual(seededOrder(runners.runners, `${study.seed}:a`).map((runner) => runner.id), seededOrder(runners.runners, `${study.seed}:b`).map((runner) => runner.id));
});

test('Wilson interval contains the observed rate for a non-degenerate sample', () => {
  const interval = wilsonInterval(7, 10);
  assert.ok(interval.low < 0.7);
  assert.ok(interval.high > 0.7);
});

test('promotion gate fails closed when holdout evidence is absent', () => {
  const decision = promotionDecision([], study, corpus, runners);
  assert.equal(decision.eligible, false);
  assert.ok(decision.reasons.some((reason) => reason.includes('needs at least')));
  assert.ok(decision.reasons.some((reason) => reason.includes('efficiency metric')));
});

test('promotion gate accepts only complete quality-preserving evidence with measured efficiency', () => {
  const rows = [];
  for (const task of corpus.tasks.filter((candidate) => study.splits.holdout.includes(candidate.id))) {
    for (let trial = 1; trial <= study.promotion.minTrialsPerTask; trial += 1) {
      rows.push(result(task, study.promotion.baseline, trial, { reasoningTokens: 100 }));
      rows.push(result(task, study.promotion.candidate, trial, { reasoningTokens: 90 }));
    }
  }
  const decision = promotionDecision(rows, study, corpus, runners);
  assert.equal(decision.eligible, true, decision.reasons.join('; '));
  assert.equal(decision.summaries.candidate.humanScoreCoverage, 1);
  assert.equal(decision.summaries.candidate.efficiencyCoverage, 1);
});

test('critical paired regression blocks promotion even if efficiency improves', () => {
  const rows = [];
  for (const task of corpus.tasks.filter((candidate) => study.splits.holdout.includes(candidate.id))) {
    for (let trial = 1; trial <= study.promotion.minTrialsPerTask; trial += 1) {
      rows.push(result(task, study.promotion.baseline, trial, { reasoningTokens: 100 }));
      rows.push(result(task, study.promotion.candidate, trial, { reasoningTokens: 80, passed: !(task.bucket === 'critical' && trial === 1) }));
    }
  }
  const decision = promotionDecision(rows, study, corpus, runners);
  assert.equal(decision.eligible, false);
  assert.ok(decision.reasons.some((reason) => reason.includes('critical paired regression')));
});

test('public evidence sanitization omits artifact paths, execution errors, route traces, and human notes', () => {
  const task = corpus.tasks.find((candidate) => study.splits.holdout.includes(candidate.id));
  const row = result(task, study.promotion.candidate, 1);
  row.execution.error = '/Users/private/repo failed';
  row.routes = { prompt: 'private' };
  row.outcome.notes = 'private reviewer note';
  const [safe] = sanitizeEvidence([row], study);
  assert.equal('artifacts' in safe, false);
  assert.equal('routes' in safe, false);
  assert.equal('error' in safe.execution, false);
  assert.deepEqual(safe.outcome, { score: 4 });
});
