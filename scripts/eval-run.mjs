import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveCodexInvocation } from '../src/codex.js';
import { materializeTask, readJson, restoreProtectedFiles, runnerPlan, validateCorpus, validateResultRecord, validateRunners } from './eval-lib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const corpus = readJson(path.join(repoRoot, 'eval', 'tasks.json'));
const runnerConfig = readJson(path.join(repoRoot, 'eval', 'runners.json'));
const pkg = readJson(path.join(repoRoot, 'package.json'));
validateCorpus(corpus);
validateRunners(runnerConfig);

function usage() {
  console.log('Usage:\n  node scripts/eval-run.mjs [--task ID] [--runner ID] [--trials N] [--out FILE] [--all] [--execute]\n\nWithout --execute this command only prints a plan and performs no model calls.\nExecution requires either --task + --runner or an explicit --all.');
}

function parseArgs(argv) {
  const args = { execute: false, all: false, trials: 1, out: path.join(repoRoot, 'eval', 'results', 'runs.jsonl') };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--execute') args.execute = true;
    else if (arg === '--all') args.all = true;
    else if (arg === '--task') args.task = argv[++i];
    else if (arg === '--runner') args.runner = argv[++i];
    else if (arg === '--trials') args.trials = Number(argv[++i]);
    else if (arg === '--out') args.out = path.resolve(argv[++i]);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!Number.isInteger(args.trials) || args.trials < 1 || args.trials > 100) throw new Error('--trials must be an integer between 1 and 100');
  if (args.all && (args.task || args.runner)) throw new Error('--all cannot be combined with --task or --runner');
  return args;
}

function select(args) {
  const tasks = args.all ? corpus.tasks : args.task ? corpus.tasks.filter((task) => task.id === args.task) : corpus.tasks;
  const runners = args.all ? runnerConfig.runners : args.runner ? runnerConfig.runners.filter((runner) => runner.id === args.runner) : runnerConfig.runners;
  if (args.task && tasks.length !== 1) throw new Error(`unknown task: ${args.task}`);
  if (args.runner && runners.length !== 1) throw new Error(`unknown runner: ${args.runner}`);
  if (args.execute && !args.all && !(args.task && args.runner)) throw new Error('refusing model execution: pass both --task and --runner, or explicitly pass --all');
  return { tasks, runners };
}

function timedOut(result) { return result?.error?.code === 'ETIMEDOUT'; }
function resultError(result) { return result?.error ? String(result.error.message || result.error) : null; }

function codexVersion() {
  try {
    const invocation = resolveCodexInvocation();
    const result = spawnSync(invocation.command, [...invocation.prefixArgs, '--version'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    if (result.status !== 0) return null;
    return String(result.stdout || result.stderr || '').trim() || null;
  } catch { return null; }
}

function runModel(runner, task, workspace) {
  try {
    const plan = runnerPlan(runner, task.prompt, { repoRoot });
    if (plan.kind === 'codex') {
      const invocation = resolveCodexInvocation();
      return spawnSync(invocation.command, [...invocation.prefixArgs, ...plan.args], { cwd: workspace, env: { ...process.env }, encoding: 'utf8', windowsHide: true, timeout: task.timeoutMs });
    }
    return spawnSync(plan.command, plan.args, { cwd: workspace, env: { ...process.env }, encoding: 'utf8', windowsHide: true, timeout: task.timeoutMs });
  } catch (error) {
    return { status: null, stdout: '', stderr: '', error };
  }
}

function runChecker(task, workspace) {
  const [command, ...args] = task.checker;
  const started = performance.now();
  const result = spawnSync(command, args, { cwd: workspace, encoding: 'utf8', windowsHide: true, timeout: task.timeoutMs });
  return { result, durationMs: performance.now() - started };
}

function sanitizeId(value) { return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-'); }

function executeOne(task, runner, trial, outputFile, codex) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), `codex-lattice-eval-${task.id}-${runner.id}-`));
  materializeTask(task, workspace);
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const model = runModel(runner, task, workspace);
  const protectedFilesChanged = restoreProtectedFiles(task, workspace);
  const checker = runChecker(task, workspace);
  const durationMs = performance.now() - started;
  const runId = sanitizeId(`${task.id}-${runner.id}-t${trial}-${startedAt}`);
  const artifactDir = path.join(path.dirname(outputFile), '..', 'artifacts', runId);
  fs.mkdirSync(artifactDir, { recursive: true });
  const stdoutFile = path.join(artifactDir, 'stdout.txt');
  const stderrFile = path.join(artifactDir, 'stderr.txt');
  const workspaceDir = path.join(artifactDir, 'workspace');
  fs.writeFileSync(stdoutFile, String(model.stdout || ''), 'utf8');
  fs.writeFileSync(stderrFile, String(model.stderr || model.error?.message || ''), 'utf8');
  fs.cpSync(workspace, workspaceDir, { recursive: true });

  const record = {
    schemaVersion: '1', corpusVersion: corpus.version, runnerConfigVersion: runnerConfig.version,
    runId, taskId: task.id, bucket: task.bucket, runnerId: runner.id, trial, startedAt, durationMs,
    execution: { exitCode: Number.isInteger(model.status) ? model.status : null, timedOut: timedOut(model), error: resultError(model) },
    checker: { passed: checker.result.status === 0, exitCode: Number.isInteger(checker.result.status) ? checker.result.status : null, timedOut: timedOut(checker.result), durationMs: checker.durationMs },
    evaluator: { protectedFilesChanged },
    environment: { node: process.version, codex, codexLattice: pkg.version, platform: process.platform, arch: process.arch },
    usage: null,
    routes: null,
    artifacts: { stdout: path.relative(repoRoot, stdoutFile), stderr: path.relative(repoRoot, stderrFile), workspace: path.relative(repoRoot, workspaceDir) }
  };
  validateResultRecord(record);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.appendFileSync(outputFile, `${JSON.stringify(record)}\n`, 'utf8');
  fs.rmSync(workspace, { recursive: true, force: true });
  console.log(`${record.checker.passed ? 'PASS' : 'FAIL'} ${task.id} × ${runner.id} trial ${trial} (${Math.round(durationMs)}ms)`);
  return record;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) { usage(); process.exit(0); }
const selected = select(args);
const plans = [];
for (const task of selected.tasks) for (const runner of selected.runners) plans.push({ taskId: task.id, bucket: task.bucket, runnerId: runner.id, trials: args.trials, invocation: runnerPlan(runner, task.prompt, { repoRoot }) });

if (!args.execute) {
  console.log(JSON.stringify({ mode: 'plan-only', warning: 'No model calls were made. Pass --execute to run an explicitly selected task/runner pair.', combinations: plans }, null, 2));
  process.exit(0);
}

const codex = codexVersion();
for (const task of selected.tasks) for (const runner of selected.runners) for (let trial = 1; trial <= args.trials; trial += 1) executeOne(task, runner, trial, args.out, codex);
