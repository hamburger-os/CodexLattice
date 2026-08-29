import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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

function completeHoldoutRows() {
  const rows = [];
  for (const task of corpus.tasks.filter((candidate) => study.splits.holdout.includes(candidate.id))) {
    for (let trial = 1; trial <= study.promotion.minTrialsPerTask; trial += 1) {
      rows.push(result(task, study.promotion.baseline, trial, { reasoningTokens: 100 }));
      rows.push(result(task, study.promotion.candidate, trial, { reasoningTokens: 90 }));
    }
  }
  return rows;
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeJsonl(file, rows) {
  fs.writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
}

function runScript(script, args) {
  return spawnSync(process.execPath, [path.join(repoRoot, 'scripts', script), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000
  });
}

function combinedOutput(run) {
  return `${run.stderr || ''}\n${run.stdout || ''}`;
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
  const decision = promotionDecision(completeHoldoutRows(), study, corpus, runners);
  assert.equal(decision.eligible, true, decision.reasons.join('; '));
  assert.equal(decision.summaries.candidate.humanScoreCoverage, 1);
  assert.equal(decision.summaries.candidate.efficiencyCoverage, 1);
});

test('critical paired regression blocks promotion even if efficiency improves', () => {
  const rows = completeHoldoutRows();
  const criticalCandidate = rows.find((row) => row.runnerId === study.promotion.candidate && row.bucket === 'critical' && row.trial === 1);
  criticalCandidate.checker = { ...criticalCandidate.checker, passed: false, exitCode: 1 };
  criticalCandidate.usage.reasoningTokens = 80;
  const decision = promotionDecision(rows, study, corpus, runners);
  assert.equal(decision.eligible, false);
  assert.ok(decision.reasons.some((reason) => reason.includes('critical paired regression')));
});

test('promotion gate rejects duplicate task/runner/trial evidence', () => {
  const rows = completeHoldoutRows();
  rows.push({ ...rows[0], runId: `${rows[0].runId}-duplicate` });
  const decision = promotionDecision(rows, study, corpus, runners);
  assert.equal(decision.eligible, false);
  assert.ok(decision.reasons.some((reason) => reason.includes('duplicate holdout result')));
});

test('promotion gate rejects unpaired candidate and baseline trials', () => {
  const rows = completeHoldoutRows();
  const taskId = study.splits.holdout[0];
  const index = rows.findIndex((row) => row.taskId === taskId && row.runnerId === study.promotion.candidate && row.trial === study.promotion.minTrialsPerTask);
  rows.splice(index, 1);
  const decision = promotionDecision(rows, study, corpus, runners);
  assert.equal(decision.eligible, false);
  assert.ok(decision.reasons.some((reason) => reason.includes('candidate/baseline trials are not paired')));
});

test('promotion gate rejects paired runs from different environments', () => {
  const rows = completeHoldoutRows();
  const candidate = rows.find((row) => row.runnerId === study.promotion.candidate);
  candidate.environment = { ...candidate.environment, platform: `${candidate.environment.platform}-mismatch` };
  const decision = promotionDecision(rows, study, corpus, runners);
  assert.equal(decision.eligible, false);
  assert.ok(decision.reasons.some((reason) => reason.includes('candidate/baseline environment mismatch')));
});

test('promotion gate rejects evidence from a stale corpus version', () => {
  const rows = completeHoldoutRows().map((row) => ({ ...row, corpusVersion: 'stale-corpus' }));
  const decision = promotionDecision(rows, study, corpus, runners);
  assert.equal(decision.eligible, false);
  assert.ok(decision.reasons.some((reason) => reason.includes('must match current corpus version')));
});

test('full-study runner refuses a non-empty output before any model execution', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-lattice-eval-guard-'));
  try {
    const output = path.join(tempDir, 'runs.jsonl');
    fs.writeFileSync(output, '{}\n', 'utf8');
    const run = runScript('eval-run.mjs', ['--all', '--execute', '--out', output]);
    assert.notEqual(run.status, 0);
    assert.match(combinedOutput(run), /refusing full-study append/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('blind grade application rejects duplicate blind IDs instead of overwriting a grade', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-lattice-grade-duplicate-'));
  try {
    const task = corpus.tasks.find((candidate) => study.splits.holdout.includes(candidate.id));
    const row = result(task, study.promotion.candidate, 1);
    const resultsFile = path.join(tempDir, 'runs.jsonl');
    const keyFile = path.join(tempDir, 'key.json');
    const gradesFile = path.join(tempDir, 'grades.json');
    const outputFile = path.join(tempDir, 'graded.jsonl');
    writeJsonl(resultsFile, [row]);
    writeJson(keyFile, { schemaVersion: 'blind-key-1', studyVersion: study.version, entries: [{ blindId: 'blind-1', runId: row.runId, runnerId: row.runnerId, taskId: row.taskId, trial: row.trial }] });
    writeJson(gradesFile, { schemaVersion: 'blind-grades-1', entries: [{ blindId: 'blind-1', score: 4 }, { blindId: 'blind-1', score: 2 }] });
    const run = runScript('eval-apply-grades.mjs', [resultsFile, '--key', keyFile, '--grades', gradesFile, '--out', outputFile]);
    assert.notEqual(run.status, 0);
    assert.match(combinedOutput(run), /duplicate grade: blind-1/);
    assert.equal(fs.existsSync(outputFile), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('blind grade application rejects ambiguous key mappings', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-lattice-grade-key-'));
  try {
    const task = corpus.tasks.find((candidate) => study.splits.holdout.includes(candidate.id));
    const row = result(task, study.promotion.candidate, 1);
    const resultsFile = path.join(tempDir, 'runs.jsonl');
    const keyFile = path.join(tempDir, 'key.json');
    const gradesFile = path.join(tempDir, 'grades.json');
    const outputFile = path.join(tempDir, 'graded.jsonl');
    writeJsonl(resultsFile, [row]);
    writeJson(keyFile, { schemaVersion: 'blind-key-1', studyVersion: study.version, entries: [
      { blindId: 'blind-1', runId: row.runId, runnerId: row.runnerId, taskId: row.taskId, trial: row.trial },
      { blindId: 'blind-2', runId: row.runId, runnerId: row.runnerId, taskId: row.taskId, trial: row.trial }
    ] });
    writeJson(gradesFile, { schemaVersion: 'blind-grades-1', entries: [] });
    const run = runScript('eval-apply-grades.mjs', [resultsFile, '--key', keyFile, '--grades', gradesFile, '--out', outputFile]);
    assert.notEqual(run.status, 0);
    assert.match(combinedOutput(run), /duplicate runId in key/);
    assert.equal(fs.existsSync(outputFile), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('blind export refuses to overwrite an existing mapping key', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-lattice-blind-key-'));
  try {
    const task = corpus.tasks.find((candidate) => study.splits.holdout.includes(candidate.id));
    const row = result(task, study.promotion.candidate, 1);
    const resultsFile = path.join(tempDir, 'runs.jsonl');
    const blindDir = path.join(tempDir, 'blind');
    const keyFile = path.join(tempDir, 'mapping-key.json');
    writeJsonl(resultsFile, [row]);
    fs.writeFileSync(keyFile, 'existing-key\n', 'utf8');
    const run = runScript('eval-blind.mjs', [resultsFile, '--out', blindDir, '--key', keyFile]);
    assert.notEqual(run.status, 0);
    assert.match(combinedOutput(run), /blind key already exists/);
    assert.equal(fs.readFileSync(keyFile, 'utf8'), 'existing-key\n');
    assert.equal(fs.existsSync(blindDir), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('public evidence export rejects a single but stale corpus version', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-lattice-publish-stale-'));
  try {
    const task = corpus.tasks.find((candidate) => study.splits.holdout.includes(candidate.id));
    const row = { ...result(task, study.promotion.candidate, 1), corpusVersion: 'stale-corpus' };
    const resultsFile = path.join(tempDir, 'runs.jsonl');
    const outputFile = path.join(tempDir, 'evidence.json');
    writeJsonl(resultsFile, [row]);
    const run = runScript('eval-publish.mjs', [resultsFile, '--out', outputFile]);
    assert.notEqual(run.status, 0);
    assert.match(combinedOutput(run), /public evidence corpus version must match current corpus version/);
    assert.equal(fs.existsSync(outputFile), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
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
