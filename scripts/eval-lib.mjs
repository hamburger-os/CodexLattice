import fs from 'node:fs';
import path from 'node:path';

export const BUCKETS = ['easy', 'medium', 'hard', 'critical'];
export const EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export function validateCorpus(corpus) {
  assert(isPlainObject(corpus), 'evaluation corpus must be an object');
  assert(typeof corpus.version === 'string' && corpus.version.length > 0, 'corpus.version is required');
  assert(Array.isArray(corpus.tasks) && corpus.tasks.length > 0, 'corpus.tasks must be a non-empty array');
  const ids = new Set();
  const counts = Object.fromEntries(BUCKETS.map((bucket) => [bucket, 0]));
  for (const task of corpus.tasks) {
    assert(isPlainObject(task), 'each task must be an object');
    assert(/^[a-z0-9][a-z0-9-]*$/.test(task.id || ''), `invalid task id: ${task.id}`);
    assert(!ids.has(task.id), `duplicate task id: ${task.id}`);
    ids.add(task.id);
    assert(BUCKETS.includes(task.bucket), `invalid bucket for ${task.id}: ${task.bucket}`);
    counts[task.bucket] += 1;
    assert(typeof task.title === 'string' && task.title.length > 0, `task ${task.id} title is required`);
    assert(typeof task.prompt === 'string' && task.prompt.length > 0, `task ${task.id} prompt is required`);
    assert(isPlainObject(task.files) && Object.keys(task.files).length >= 2, `task ${task.id} needs at least two files`);
    for (const [relative, content] of Object.entries(task.files)) {
      assert(typeof relative === 'string' && relative.length > 0, `task ${task.id} has invalid file path`);
      assert(typeof content === 'string', `task ${task.id} file ${relative} must be text`);
      safeRelativePath(relative);
    }
    assert(Array.isArray(task.protectedFiles) && task.protectedFiles.length > 0, `task ${task.id} protectedFiles must be non-empty`);
    for (const relative of task.protectedFiles) {
      safeRelativePath(relative);
      assert(Object.prototype.hasOwnProperty.call(task.files, relative), `task ${task.id} protected file is missing from files: ${relative}`);
    }
    assert(Array.isArray(task.checker) && task.checker.length > 0 && task.checker.every((part) => typeof part === 'string' && part.length > 0), `task ${task.id} checker must be a string array`);
    assert(Number.isInteger(task.timeoutMs) && task.timeoutMs >= 1000 && task.timeoutMs <= 300000, `task ${task.id} timeoutMs is invalid`);
    assert(Array.isArray(task.tags) && task.tags.every((tag) => typeof tag === 'string' && tag.length > 0), `task ${task.id} tags must be strings`);
  }
  return { taskCount: corpus.tasks.length, counts };
}

export function validateRunners(config) {
  assert(isPlainObject(config), 'runner config must be an object');
  assert(typeof config.version === 'string' && config.version.length > 0, 'runners.version is required');
  assert(Array.isArray(config.runners) && config.runners.length > 0, 'runners.runners must be a non-empty array');
  const ids = new Set();
  for (const runner of config.runners) {
    assert(/^[a-z0-9][a-z0-9-]*$/.test(runner.id || ''), `invalid runner id: ${runner.id}`);
    assert(!ids.has(runner.id), `duplicate runner id: ${runner.id}`);
    ids.add(runner.id);
    assert(['lattice', 'codex'].includes(runner.kind), `runner ${runner.id} has invalid kind`);
    if (runner.kind === 'lattice') {
      assert(Object.keys(runner).every((key) => ['id', 'kind'].includes(key)), `lattice runner ${runner.id} has unexpected fields`);
    } else {
      assert(typeof runner.model === 'string' && runner.model.length > 0, `codex runner ${runner.id} needs model`);
      assert(EFFORTS.includes(runner.effort), `codex runner ${runner.id} has invalid effort`);
    }
  }
  return { runnerCount: config.runners.length };
}

export function safeRelativePath(relative) {
  assert(typeof relative === 'string' && relative.length > 0, 'relative path is required');
  assert(!path.isAbsolute(relative), `absolute paths are not allowed: ${relative}`);
  const normalized = path.normalize(relative);
  assert(normalized !== '..' && !normalized.startsWith(`..${path.sep}`), `path traversal is not allowed: ${relative}`);
  assert(!normalized.includes(`\0`), `NUL is not allowed in path: ${relative}`);
  return normalized;
}

export function resolveInside(root, relative) {
  const normalized = safeRelativePath(relative);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, normalized);
  const prefix = `${resolvedRoot}${path.sep}`;
  assert(resolved === resolvedRoot || resolved.startsWith(prefix), `path escapes workspace: ${relative}`);
  return resolved;
}

export function materializeTask(task, workspace) {
  fs.mkdirSync(workspace, { recursive: true });
  for (const [relative, content] of Object.entries(task.files)) {
    const target = resolveInside(workspace, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
  }
}

export function restoreProtectedFiles(task, workspace) {
  const changed = [];
  for (const relative of task.protectedFiles || []) {
    const target = resolveInside(workspace, relative);
    const expected = task.files[relative];
    let actual = null;
    try { actual = fs.readFileSync(target, 'utf8'); } catch { actual = null; }
    if (actual !== expected) changed.push(relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, expected, 'utf8');
  }
  return changed;
}

export function validateResultRecord(record) {
  assert(isPlainObject(record), 'result must be an object');
  assert(record.schemaVersion === '1', 'result schemaVersion must be 1');
  for (const field of ['corpusVersion', 'runnerConfigVersion', 'runId', 'taskId', 'runnerId', 'startedAt']) {
    assert(typeof record[field] === 'string' && record[field].length > 0, `result ${field} is required`);
  }
  assert(BUCKETS.includes(record.bucket), `result has invalid bucket: ${record.bucket}`);
  assert(Number.isInteger(record.trial) && record.trial >= 1, 'result trial must be a positive integer');
  assert(Number.isFinite(record.durationMs) && record.durationMs >= 0, 'result durationMs must be non-negative');
  assert(isPlainObject(record.execution), 'result execution is required');
  assert(record.execution.exitCode === null || Number.isInteger(record.execution.exitCode), 'execution.exitCode must be integer or null');
  assert(typeof record.execution.timedOut === 'boolean', 'execution.timedOut must be boolean');
  assert(record.execution.error === null || typeof record.execution.error === 'string', 'execution.error must be string or null');
  assert(isPlainObject(record.checker) && typeof record.checker.passed === 'boolean', 'result checker is required');
  assert(record.checker.exitCode === null || Number.isInteger(record.checker.exitCode), 'checker.exitCode must be integer or null');
  assert(typeof record.checker.timedOut === 'boolean', 'checker.timedOut must be boolean');
  assert(Number.isFinite(record.checker.durationMs) && record.checker.durationMs >= 0, 'checker.durationMs must be non-negative');
  assert(isPlainObject(record.evaluator) && Array.isArray(record.evaluator.protectedFilesChanged), 'result evaluator integrity is required');
  assert(isPlainObject(record.environment), 'result environment is required');
  assert(record.usage === null || isPlainObject(record.usage), 'result usage must be object or null');
  assert(record.routes === null || isPlainObject(record.routes), 'result routes must be object or null');
  return record;
}

export function codexArgsForRunner(runner, prompt) {
  if (runner.kind !== 'codex') throw new Error(`runner ${runner.id} is not a fixed Codex runner`);
  return ['exec', '--model', runner.model, '-c', `model_reasoning_effort=${JSON.stringify(runner.effort)}`, prompt];
}

export function runnerPlan(runner, prompt, { repoRoot = process.cwd() } = {}) {
  if (runner.kind === 'codex') return { kind: 'codex', args: codexArgsForRunner(runner, prompt) };
  if (runner.kind === 'lattice') {
    return { kind: 'lattice', command: process.execPath, args: [path.join(repoRoot, 'bin', 'codex-lattice.js'), 'run', prompt] };
  }
  throw new Error(`unknown runner kind: ${runner.kind}`);
}

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function groupKey(result, bucket) {
  return `${result.runnerId}\u0000${bucket}`;
}

export function summarizeResults(results) {
  const groups = new Map();
  for (const result of results) {
    for (const bucket of [result.bucket, 'overall']) {
      const key = groupKey(result, bucket);
      if (!groups.has(key)) groups.set(key, { runnerId: result.runnerId, bucket, rows: [] });
      groups.get(key).rows.push(result);
    }
  }
  return [...groups.values()].map(({ runnerId, bucket, rows }) => {
    const durations = rows.map((row) => Number(row.durationMs)).filter(Number.isFinite);
    const scored = rows.map((row) => row.outcome?.score).filter(Number.isFinite);
    const usageRows = rows.filter((row) => row.usage && typeof row.usage === 'object');
    const sumUsage = (field) => {
      const values = usageRows.map((row) => row.usage?.[field]).filter(Number.isFinite);
      return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    };
    const passed = rows.filter((row) => row.checker?.passed === true).length;
    return {
      runnerId, bucket, trials: rows.length, passCount: passed,
      passRate: rows.length ? passed / rows.length : null,
      meanDurationMs: mean(durations), medianDurationMs: median(durations),
      scoredTrials: scored.length, meanScore: mean(scored), usageAvailableTrials: usageRows.length,
      inputTokens: sumUsage('inputTokens'), outputTokens: sumUsage('outputTokens'),
      reasoningTokens: sumUsage('reasoningTokens'), costUsd: sumUsage('costUsd')
    };
  }).sort((a, b) => a.runnerId.localeCompare(b.runnerId) || BUCKETS.concat('overall').indexOf(a.bucket) - BUCKETS.concat('overall').indexOf(b.bucket));
}

export function parseJsonLines(text) {
  return String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`invalid JSONL on line ${index + 1}: ${error.message}`); }
  });
}
