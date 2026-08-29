import crypto from 'node:crypto';

const BUCKETS = ['easy', 'medium', 'hard', 'critical'];
const EFFICIENCY_METRICS = ['inputTokens', 'outputTokens', 'reasoningTokens', 'costUsd'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export function validateStudy(study, corpus, runnerConfig) {
  assert(isPlainObject(study), 'study config must be an object');
  assert(typeof study.version === 'string' && study.version.length > 0, 'study.version is required');
  assert(typeof study.seed === 'string' && study.seed.length >= 8, 'study.seed must be a non-trivial string');
  assert(typeof study.gradingSeed === 'string' && study.gradingSeed.length >= 8, 'study.gradingSeed must be a non-trivial string');
  assert(isPlainObject(study.splits), 'study.splits is required');
  assert(Array.isArray(study.splits.calibration) && Array.isArray(study.splits.holdout), 'calibration and holdout splits are required');

  const tasks = corpus?.tasks || [];
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const allSplitIds = [...study.splits.calibration, ...study.splits.holdout];
  assert(new Set(allSplitIds).size === allSplitIds.length, 'calibration and holdout splits must be disjoint and duplicate-free');
  assert(allSplitIds.length === tasks.length, 'study splits must cover the full corpus exactly once');
  for (const id of allSplitIds) assert(taskById.has(id), `study split references unknown task: ${id}`);
  for (const task of tasks) assert(allSplitIds.includes(task.id), `study split omits task: ${task.id}`);

  for (const bucket of BUCKETS) {
    const calibrationCount = study.splits.calibration.filter((id) => taskById.get(id)?.bucket === bucket).length;
    const holdoutCount = study.splits.holdout.filter((id) => taskById.get(id)?.bucket === bucket).length;
    assert(calibrationCount > 0, `calibration split needs at least one ${bucket} task`);
    assert(holdoutCount > 0, `holdout split needs at least one ${bucket} task`);
  }

  const promotion = study.promotion;
  assert(isPlainObject(promotion), 'study.promotion is required');
  const runnerIds = new Set((runnerConfig?.runners || []).map((runner) => runner.id));
  assert(runnerIds.has(promotion.candidate), `promotion candidate runner is unknown: ${promotion.candidate}`);
  assert(runnerIds.has(promotion.baseline), `promotion baseline runner is unknown: ${promotion.baseline}`);
  assert(promotion.candidate !== promotion.baseline, 'promotion candidate and baseline must differ');
  assert(Number.isInteger(promotion.minTrialsPerTask) && promotion.minTrialsPerTask >= 1 && promotion.minTrialsPerTask <= 100, 'promotion.minTrialsPerTask must be 1..100');
  assert(typeof promotion.requireHumanScores === 'boolean', 'promotion.requireHumanScores must be boolean');
  assert(Number.isFinite(promotion.maxPassRateDrop) && promotion.maxPassRateDrop >= 0 && promotion.maxPassRateDrop <= 1, 'promotion.maxPassRateDrop must be 0..1');
  assert(Number.isFinite(promotion.maxMeanScoreDrop) && promotion.maxMeanScoreDrop >= 0 && promotion.maxMeanScoreDrop <= 4, 'promotion.maxMeanScoreDrop must be 0..4');
  assert(typeof promotion.requireCriticalNoRegression === 'boolean', 'promotion.requireCriticalNoRegression must be boolean');
  assert(isPlainObject(promotion.efficiency), 'promotion.efficiency is required');
  assert(EFFICIENCY_METRICS.includes(promotion.efficiency.metric), `unsupported efficiency metric: ${promotion.efficiency.metric}`);
  assert(Number.isFinite(promotion.efficiency.minCoverage) && promotion.efficiency.minCoverage > 0 && promotion.efficiency.minCoverage <= 1, 'promotion.efficiency.minCoverage must be >0 and <=1');
  assert(Number.isFinite(promotion.efficiency.maxRatio) && promotion.efficiency.maxRatio > 0 && promotion.efficiency.maxRatio <= 1, 'promotion.efficiency.maxRatio must be >0 and <=1');
  return {
    version: study.version,
    calibrationTasks: study.splits.calibration.length,
    holdoutTasks: study.splits.holdout.length,
    candidate: promotion.candidate,
    baseline: promotion.baseline
  };
}

export function studySplitForTask(study, taskId) {
  if (study.splits.calibration.includes(taskId)) return 'calibration';
  if (study.splits.holdout.includes(taskId)) return 'holdout';
  throw new Error(`task is not assigned to a study split: ${taskId}`);
}

function hashRank(seed, id) {
  return crypto.createHash('sha256').update(`${seed}\0${id}`).digest('hex');
}

export function seededOrder(items, seed, id = (item) => String(item?.id ?? item)) {
  return [...items].map((item, index) => ({ item, index, rank: hashRank(seed, id(item)) }))
    .sort((a, b) => a.rank.localeCompare(b.rank) || a.index - b.index)
    .map(({ item }) => item);
}

export function buildStudyPlan(study, tasks, runners, trials) {
  assert(Number.isInteger(trials) && trials >= 1, 'trials must be a positive integer');
  const groups = [];
  for (const task of tasks) {
    for (let trial = 1; trial <= trials; trial += 1) groups.push({ task, trial, id: `${task.id}:t${trial}` });
  }
  const orderedGroups = seededOrder(groups, `${study.seed}:groups`);
  const plan = [];
  for (const group of orderedGroups) {
    const orderedRunners = seededOrder(runners, `${study.seed}:${group.task.id}:t${group.trial}`);
    for (const runner of orderedRunners) {
      plan.push({
        task: group.task,
        runner,
        trial: group.trial,
        split: studySplitForTask(study, group.task.id),
        orderIndex: plan.length
      });
    }
  }
  return plan;
}

export function wilsonInterval(successes, trials, z = 1.96) {
  if (!Number.isInteger(successes) || !Number.isInteger(trials) || trials < 0 || successes < 0 || successes > trials) throw new Error('invalid Wilson interval counts');
  if (trials === 0) return { low: null, high: null };
  const p = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials)) / denominator;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function summarizeRows(rows, efficiencyMetric) {
  const passCount = rows.filter((row) => row.checker?.passed === true).length;
  const scores = rows.map((row) => row.outcome?.score).filter(Number.isFinite);
  const metricValues = rows.map((row) => row.usage?.[efficiencyMetric]).filter(Number.isFinite);
  return {
    trials: rows.length,
    passCount,
    passRate: rows.length ? passCount / rows.length : null,
    passWilson95: wilsonInterval(passCount, rows.length),
    humanScoreCoverage: rows.length ? scores.length / rows.length : 0,
    meanScore: mean(scores),
    efficiencyCoverage: rows.length ? metricValues.length / rows.length : 0,
    meanEfficiency: mean(metricValues)
  };
}

function pairKey(row) {
  return `${row.taskId}\0${row.trial}`;
}

export function promotionDecision(results, study, corpus, runnerConfig) {
  validateStudy(study, corpus, runnerConfig);
  const { candidate, baseline, minTrialsPerTask, requireHumanScores, maxPassRateDrop, maxMeanScoreDrop, requireCriticalNoRegression, efficiency } = study.promotion;
  const holdoutIds = new Set(study.splits.holdout);
  const relevant = results.filter((row) => holdoutIds.has(row.taskId) && [candidate, baseline].includes(row.runnerId));
  const reasons = [];

  const corpusVersions = new Set(relevant.map((row) => row.corpusVersion).filter(Boolean));
  const runnerVersions = new Set(relevant.map((row) => row.runnerConfigVersion).filter(Boolean));
  if (corpusVersions.size !== 1) reasons.push('holdout results must use exactly one corpus version');
  if (runnerVersions.size !== 1) reasons.push('holdout results must use exactly one runner-config version');

  for (const taskId of holdoutIds) {
    for (const runnerId of [candidate, baseline]) {
      const rows = relevant.filter((row) => row.taskId === taskId && row.runnerId === runnerId);
      const distinctTrials = new Set(rows.map((row) => row.trial));
      if (distinctTrials.size < minTrialsPerTask) reasons.push(`${taskId} × ${runnerId} needs at least ${minTrialsPerTask} distinct trials`);
    }
  }

  if (relevant.some((row) => (row.evaluator?.protectedFilesChanged || []).length > 0)) reasons.push('protected evaluator files changed in at least one holdout run');
  if (relevant.some((row) => row.execution?.timedOut === true || row.checker?.timedOut === true)) reasons.push('timed-out holdout runs are not promotion-eligible');

  const candidateRows = relevant.filter((row) => row.runnerId === candidate);
  const baselineRows = relevant.filter((row) => row.runnerId === baseline);
  const summaries = {
    candidate: summarizeRows(candidateRows, efficiency.metric),
    baseline: summarizeRows(baselineRows, efficiency.metric),
    buckets: {}
  };

  for (const bucket of BUCKETS) {
    const cRows = candidateRows.filter((row) => row.bucket === bucket);
    const bRows = baselineRows.filter((row) => row.bucket === bucket);
    summaries.buckets[bucket] = {
      candidate: summarizeRows(cRows, efficiency.metric),
      baseline: summarizeRows(bRows, efficiency.metric)
    };
    if (cRows.length && bRows.length && summaries.buckets[bucket].candidate.passRate + maxPassRateDrop < summaries.buckets[bucket].baseline.passRate) {
      reasons.push(`${bucket} holdout pass rate regresses beyond the allowed delta`);
    }
    if (requireHumanScores && cRows.length && bRows.length) {
      if (summaries.buckets[bucket].candidate.humanScoreCoverage < 1 || summaries.buckets[bucket].baseline.humanScoreCoverage < 1) reasons.push(`${bucket} holdout human-score coverage is incomplete`);
      else if (summaries.buckets[bucket].candidate.meanScore + maxMeanScoreDrop < summaries.buckets[bucket].baseline.meanScore) reasons.push(`${bucket} holdout human score regresses beyond the allowed delta`);
    }
  }

  if (candidateRows.length && baselineRows.length && summaries.candidate.passRate + maxPassRateDrop < summaries.baseline.passRate) reasons.push('overall holdout pass rate regresses beyond the allowed delta');
  if (requireHumanScores) {
    if (summaries.candidate.humanScoreCoverage < 1 || summaries.baseline.humanScoreCoverage < 1) reasons.push('overall holdout human-score coverage is incomplete');
    else if (summaries.candidate.meanScore + maxMeanScoreDrop < summaries.baseline.meanScore) reasons.push('overall holdout human score regresses beyond the allowed delta');
  }

  if (requireCriticalNoRegression) {
    const cByPair = new Map(candidateRows.filter((row) => row.bucket === 'critical').map((row) => [pairKey(row), row]));
    const bByPair = new Map(baselineRows.filter((row) => row.bucket === 'critical').map((row) => [pairKey(row), row]));
    for (const [key, baselineRow] of bByPair) {
      const candidateRow = cByPair.get(key);
      if (baselineRow.checker?.passed === true && candidateRow?.checker?.passed !== true) reasons.push(`critical paired regression at ${key.replace('\0', ' trial ')}`);
      if (requireHumanScores && Number.isFinite(baselineRow.outcome?.score) && (!Number.isFinite(candidateRow?.outcome?.score) || candidateRow.outcome.score + maxMeanScoreDrop < baselineRow.outcome.score)) reasons.push(`critical paired human-score regression at ${key.replace('\0', ' trial ')}`);
    }
  }

  if (summaries.candidate.efficiencyCoverage < efficiency.minCoverage || summaries.baseline.efficiencyCoverage < efficiency.minCoverage) {
    reasons.push(`efficiency metric ${efficiency.metric} does not meet required coverage`);
  } else if (!(summaries.baseline.meanEfficiency > 0)) {
    reasons.push(`baseline ${efficiency.metric} must be positive`);
  } else if (summaries.candidate.meanEfficiency > summaries.baseline.meanEfficiency * efficiency.maxRatio) {
    reasons.push(`candidate ${efficiency.metric} does not meet the required efficiency ratio`);
  }

  return {
    studyVersion: study.version,
    eligible: reasons.length === 0,
    reasons: [...new Set(reasons)],
    holdoutTaskCount: holdoutIds.size,
    efficiencyMetric: efficiency.metric,
    summaries
  };
}

export function blindIdForRun(runId, gradingSeed) {
  return `blind-${crypto.createHash('sha256').update(`${gradingSeed}\0${runId}`).digest('hex').slice(0, 16)}`;
}

export function buildBlindRows(results, study) {
  const rows = results.map((row) => ({ row, blindId: blindIdForRun(row.runId, study.gradingSeed) }));
  return seededOrder(rows, `${study.gradingSeed}:order`, (item) => item.blindId);
}

export function sanitizeEvidence(results, study) {
  return results.map((row) => ({
    schemaVersion: 'evidence-1',
    studyVersion: study.version,
    split: studySplitForTask(study, row.taskId),
    corpusVersion: row.corpusVersion,
    runnerConfigVersion: row.runnerConfigVersion,
    runId: row.runId,
    taskId: row.taskId,
    bucket: row.bucket,
    runnerId: row.runnerId,
    trial: row.trial,
    startedAt: row.startedAt,
    durationMs: row.durationMs,
    execution: { exitCode: row.execution?.exitCode ?? null, timedOut: row.execution?.timedOut === true },
    checker: row.checker,
    evaluator: row.evaluator,
    environment: row.environment,
    usage: row.usage,
    outcome: row.outcome && Number.isFinite(row.outcome.score) ? { score: row.outcome.score } : null
  }));
}
