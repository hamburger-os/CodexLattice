import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../src/policy.js';
import { buildCodexExecArgs, orchestrationPrompt } from '../src/runtime.js';

test('root Codex execution uses the selected execute route', () => {
  const task = 'fix a typo in README';
  const plan = buildPlan(task);
  const args = buildCodexExecArgs(task, plan);
  assert.deepEqual(args.slice(0, 5), [
    'exec',
    '--model',
    plan.stages.execute.model,
    '-c',
    `model_reasoning_effort=${JSON.stringify(plan.stages.execute.effort)}`
  ]);
});

test('orchestration prompt requires per-stage model and effort on subagent spawn', () => {
  const task = 'refactor authentication across multiple modules';
  const plan = buildPlan(task);
  const prompt = orchestrationPrompt(task, plan);
  assert.match(prompt, /explicitly request that stage's model and reasoning effort/i);
  assert.match(prompt, new RegExp(plan.stages.plan.model.replaceAll('.', '\\.')));
});
