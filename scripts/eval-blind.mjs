import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBlindRows, validateStudy } from './evidence-lib.mjs';
import { parseJsonLines, readJson, validateResultRecord } from './eval-lib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = { study: path.join(repoRoot, 'eval', 'study.json') };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--study') args.study = path.resolve(argv[++i]);
    else if (arg === '--out') args.out = path.resolve(argv[++i]);
    else if (arg === '--key') args.key = path.resolve(argv[++i]);
    else if (!args.file) args.file = path.resolve(arg);
    else throw new Error(`unexpected argument: ${arg}`);
  }
  if (!args.file || !args.out || !args.key) throw new Error('usage: node scripts/eval-blind.mjs <results.jsonl> --out <blind-dir> --key <mapping-key.json> [--study FILE]');
  const relative = path.relative(args.out, args.key);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('--key must be stored outside the blind output directory');
  return args;
}

function resolveRepoArtifact(relative) {
  if (typeof relative !== 'string' || !relative) throw new Error('result is missing an artifact workspace path');
  const resolved = path.resolve(repoRoot, relative);
  const prefix = `${repoRoot}${path.sep}`;
  if (!(resolved === repoRoot || resolved.startsWith(prefix))) throw new Error(`artifact path escapes repository: ${relative}`);
  return resolved;
}

const args = parseArgs(process.argv.slice(2));
const corpus = readJson(path.join(repoRoot, 'eval', 'tasks.json'));
const runnerConfig = readJson(path.join(repoRoot, 'eval', 'runners.json'));
const study = readJson(args.study);
validateStudy(study, corpus, runnerConfig);
const taskById = new Map(corpus.tasks.map((task) => [task.id, task]));
const results = parseJsonLines(fs.readFileSync(args.file, 'utf8'));
for (const row of results) validateResultRecord(row);

if (fs.existsSync(args.out)) throw new Error(`blind output already exists: ${args.out}`);
if (fs.existsSync(args.key)) throw new Error(`blind key already exists: ${args.key}`);
fs.mkdirSync(args.out, { recursive: true });
const grading = [];
const mapping = [];
for (const { row, blindId } of buildBlindRows(results, study)) {
  const task = taskById.get(row.taskId);
  if (!task) throw new Error(`unknown task in result: ${row.taskId}`);
  const sourceWorkspace = resolveRepoArtifact(row.artifacts?.workspace);
  if (!fs.statSync(sourceWorkspace).isDirectory()) throw new Error(`artifact workspace is not a directory: ${row.artifacts.workspace}`);
  const targetDir = path.join(args.out, blindId);
  const targetWorkspace = path.join(targetDir, 'workspace');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.cpSync(sourceWorkspace, targetWorkspace, { recursive: true });
  grading.push({
    blindId,
    taskId: row.taskId,
    bucket: row.bucket,
    trial: row.trial,
    title: task.title,
    prompt: task.prompt,
    workspace: `${blindId}/workspace`
  });
  mapping.push({ blindId, runId: row.runId, runnerId: row.runnerId, taskId: row.taskId, trial: row.trial });
}
fs.writeFileSync(path.join(args.out, 'grading.json'), `${JSON.stringify({ schemaVersion: 'blind-grading-1', studyVersion: study.version, entries: grading }, null, 2)}\n`, 'utf8');
fs.mkdirSync(path.dirname(args.key), { recursive: true });
fs.writeFileSync(args.key, `${JSON.stringify({ schemaVersion: 'blind-key-1', studyVersion: study.version, entries: mapping }, null, 2)}\n`, 'utf8');
console.log(`Prepared ${grading.length} anonymized workspaces in ${args.out}. Keep ${args.key} away from graders.`);
