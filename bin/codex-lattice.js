#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildPlan, shadowComparison } from '../src/policy.js';
import { buildCodexExecArgs } from '../src/runtime.js';
import { install, setMode, uninstall, codexHome } from '../src/installer.js';
import {
  appendTelemetry,
  setTelemetry,
  summarizeTelemetry,
  taskIdentity,
  telemetryStatus
} from '../src/telemetry.js';

const [cmd, ...args] = process.argv.slice(2);

function help() {
  console.log(`CodexLattice

Commands:
  install [adaptive|single]
  mode <adaptive|single>
  explain [--trace] <task>
  shadow <task>
  run <task>
  telemetry <on|off|status|summarize> [jsonl-path]
  feedback <run-id> <pass|fail|mixed> [note]
  doctor
  uninstall
`);
}

function compactRoute(route) {
  return { model: route.model, effort: route.effort, quality: route.quality, cost: route.cost };
}

try {
  if (!cmd || ['-h', '--help', 'help'].includes(cmd)) {
    help();
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
    const home = codexHome();
    const config = path.join(home, 'config.toml');
    console.log(JSON.stringify({
      codexHome: home,
      configExists: fs.existsSync(config),
      codexOnPath: spawnSync('codex', ['--version'], { encoding: 'utf8' }).status === 0,
      telemetry: telemetryStatus()
    }, null, 2));
    process.exit(0);
  }

  if (cmd === 'run') {
    const task = args.join(' ');
    if (!task) throw new Error('run requires a task');
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
    const result = spawnSync('codex', buildCodexExecArgs(task, plan), { stdio: 'inherit' });
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
