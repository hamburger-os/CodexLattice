import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { materializeTask, readJson, validateCorpus, validateRunners } from './eval-lib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const corpus = readJson(path.join(repoRoot, 'eval', 'tasks.json'));
const runners = readJson(path.join(repoRoot, 'eval', 'runners.json'));
const schema = readJson(path.join(repoRoot, 'eval', 'result.schema.json'));
const corpusSummary = validateCorpus(corpus);
const runnerSummary = validateRunners(runners);
if (schema?.properties?.schemaVersion?.const !== '1') throw new Error('result schema version must be 1');

for (const bucket of ['easy', 'medium', 'hard', 'critical']) {
  if (corpusSummary.counts[bucket] < 2) throw new Error(`corpus needs at least two ${bucket} tasks`);
}

for (const task of corpus.tasks) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), `codex-lattice-eval-${task.id}-`));
  try {
    materializeTask(task, workspace);
    const [command, ...args] = task.checker;
    const result = spawnSync(command, args, { cwd: workspace, encoding: 'utf8', windowsHide: true, timeout: task.timeoutMs });
    if (result.status === 0) throw new Error(`seed task ${task.id} already passes its checker; benchmark tasks must require a change`);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

console.log(`Validated evaluation corpus v${corpus.version}: ${corpusSummary.taskCount} tasks (${Object.entries(corpusSummary.counts).map(([bucket, count]) => `${bucket}=${count}`).join(', ')}).`);
console.log(`Validated runner config v${runners.version}: ${runnerSummary.runnerCount} runners.`);
console.log('All seed tasks fail their deterministic checker before model execution.');
