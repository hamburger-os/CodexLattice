import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../src/policy.js';
import { agentTypeFor } from '../src/roles.js';
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

test('orchestration prompt uses exact route-specific native agent types', () => {
  const task = 'refactor authentication across multiple modules';
  const plan = buildPlan(task);
  const prompt = orchestrationPrompt(task, plan);
  const plannerType = agentTypeFor('plan', plan.stages.plan);
  const reviewerType = agentTypeFor('verify', plan.stages.verify);
  assert.match(prompt, new RegExp(plannerType));
  assert.match(prompt, new RegExp(reviewerType));
  assert.match(prompt, /Do not supply a model or reasoning override at spawn time/i);
});
