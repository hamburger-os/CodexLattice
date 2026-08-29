#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { buildPlan, shadowComparison } from '../src/policy.js';
import { buildCodexExecArgs } from '../src/runtime.js';
import {
  PACKAGE_VERSION,
  assertReadyForRun,
  doctor,
  install,
  setMode,
  uninstall
} from '../src/installer.js';
import {
  appendTelemetry,
  setTelemetry,
  summarizeTelemetry,
  taskIdentity,
  telemetryStatus
} from '../src/telemetry.js';

const [cmd, ...args] = process.argv.slice(2);

function help() {
  console.log(`CodexLattice ${PACKAGE_VERSION}\n\nCommands:\n  install [adaptive|single]\n  mode <adaptive|single>\n  explain [--trace] <task>\n  shadow <task>\n  run <task>\n  telemetry <on|off|status|summarize> [jsonl-path]\n  feedback <run-id> <pass|fail|mixed> [note]\n  doctor [--strict]\n  uninstall\n  version\n`);
}

function compactRoute(route) {
  return { model: route.model, effort: route.effort, quality: route.quality, cost: route.cost };
}

try {
  if (!cmd || ['-h', '--help', 'help'].includes(cmd)) {
    help();
    process.exit(0);
  }

  if (cmd === 'version' || cmd === '--version' || cmd === '-v') {
    console.log(PACKAGE_VERSION);
    process.exit(0);
  }

  if (cmd === 'install') {
    console.log(JSON.stringify(install(args[0] || 'adaptive'), null, 2));
    process.exit(0);
  }

  if (cmd === 'mode') {
    console.log(JSON.stringify(setMode(args[0]), null, 2));
    process.exit(0);
  }

  if (cmd === 'uninstall') {
    console.log(JSON.stringify(uninstall(), null, 2));
    process.exit(0);
  }

  if (cmd === 'explain') {
    const trace = args[0] === '--trace';
    const task = (trace ? args.slice(1) : args).join(' ');
    if (!task) throw new Error('explain requires a task');
    console.log(JSON.stringify(buildPlan(task, { includeTrace: trace }), null, 2));
    process.exit(0);
  }

  if (cmd === 'shadow') {
    const task = args.join(' ');
    if (!task) throw new Error('shadow requires a task');
    console.log(JSON.stringify(shadowComparison(task), null, 2));
    process.exit(0);
  }

  if (cmd === 'telemetry') {
    const action = args[0] || 'status';
    if (action === 'on') console.log(JSON.stringify(setTelemetry(true), null, 2));
    else if (action === 'off') console.log(JSON.stringify(setTelemetry(false), null, 2));
    else if (action === 'status') console.log(JSON.stringify(telemetryStatus(), null, 2));
    else if (action === 'summarize') console.log(JSON.stringify(summarizeTelemetry(args[1]), null, 2));
    else throw new Error('telemetry action must be on, off, status, or summarize');
    process.exit(0);
  }

  if (cmd === 'feedback') {
    const [runId, label, ...noteParts] = args;
    if (!runId || !['pass', 'fail', 'mixed'].includes(label)) {
      throw new Error('feedback usage: feedback <run-id> <pass|fail|mixed> [note]');
    }
    const written = appendTelemetry('feedback', { runId, label, note: noteParts.join(' ') || undefined });
    if (!written) throw new Error('telemetry is off; enable it with `codex-lattice telemetry on` before recording feedback');
    console.log(JSON.stringify({ recorded: true, runId, label }, null, 2));
    process.exit(0);
  }

  if (cmd === 'doctor') {
    const report = doctor();
    console.log(JSON.stringify(report, null, 2));
    if (args.includes('--strict') && report.overallStatus !== 'ok') process.exit(1);
    process.exit(report.overallStatus === 'error' ? 1 : 0);
  }

  if (cmd === 'run') {
    const task = args.join(' ');
    if (!task) throw new Error('run requires a task');
    assertReadyForRun();
    const plan = buildPlan(task);
    const runId = crypto.randomUUID();
    const startedAt = Date.now();
    appendTelemetry('run_started', {
      runId,
      ...taskIdentity(task),
      features: plan.features,
      executeRoute: compactRoute(plan.stages.execute),
      verifyRoute: compactRoute(plan.stages.verify)
    });
    const result = spawnSync(process.env.CODEX_LATTICE_CODEX || 'codex', buildCodexExecArgs(task, plan), { stdio: 'inherit' });
    appendTelemetry('run_finished', {
      runId,
      exitCode: result.status ?? 1,
      signal: result.signal || null,
      elapsedMs: Date.now() - startedAt
    });
    if (telemetryStatus().enabled) console.error(`CodexLattice run id: ${runId}`);
    process.exit(result.status ?? 1);
  }

  help();
  process.exit(1);
} catch (error) {
  console.error(`codex-lattice: ${error.message}`);
  process.exit(1);
}
