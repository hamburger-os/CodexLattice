import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { buildPlan } from '../src/policy.js';
import { agentTypeFor } from '../src/roles.js';
import {
  handleUserPromptSubmit,
  runHookFromStdin,
  shouldRouteUserPrompt
} from '../src/hook.js';

function rootPayload(overrides = {}) {
  return {
    session_id: 'session-1',
    turn_id: 'turn-1',
    agent_id: null,
    agent_type: null,
    transcript_path: '/tmp/codex-rollout.jsonl',
    cwd: '/tmp/repo',
    hook_event_name: 'UserPromptSubmit',
    model: 'gpt-5.6-luna',
    permission_mode: 'default',
    prompt: 'refactor authentication across multiple modules',
    ...overrides
  };
}

test('root UserPromptSubmit injects deterministic route context without elevating raw user text', () => {
  const prompt = 'refactor authentication across multiple modules UNIQUE_USER_TEXT_73A';
  const payload = rootPayload({ prompt });
  const result = handleUserPromptSubmit(payload, { env: {} });
  const context = result.hookSpecificOutput.additionalContext;
  const plan = buildPlan(prompt);

  assert.equal(result.continue, true);
  assert.equal(result.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(context, /transparent adaptive orchestration/i);
  assert.match(context, new RegExp(agentTypeFor('execute', plan.stages.execute)));
  assert.match(context, new RegExp(agentTypeFor('verify', plan.stages.verify)));
  assert.doesNotMatch(context, /UNIQUE_USER_TEXT_73A/);
  assert.match(context, /root process is a coordinator/i);
});

test('subagent UserPromptSubmit turns are never recursively routed', () => {
  const payload = rootPayload({ agent_id: 'agent-2', agent_type: 'lattice_execute_terra_medium' });
  assert.equal(shouldRouteUserPrompt(payload, {}), false);
  assert.deepEqual(handleUserPromptSubmit(payload, { env: {} }), { continue: true });
});

test('non-resumable desktop background turns fail open unless explicitly enabled', () => {
  const payload = rootPayload({ transcript_path: null });
  assert.equal(shouldRouteUserPrompt(payload, {}), false);
  assert.equal(shouldRouteUserPrompt(payload, { CODEX_LATTICE_ROUTE_EPHEMERAL: '1' }), true);
});

test('explicit codex-lattice run can bypass the transparent hook', () => {
  const payload = rootPayload();
  assert.equal(shouldRouteUserPrompt(payload, { CODEX_LATTICE_BYPASS_HOOK: '1' }), false);
});

test('plan permission mode instructs coordinator not to implement', () => {
  const result = handleUserPromptSubmit(rootPayload({ permission_mode: 'plan' }), { env: {} });
  assert.match(result.hookSpecificOutput.additionalContext, /"planMode": true/);
  assert.match(result.hookSpecificOutput.additionalContext, /do not perform implementation or file edits/i);
});

test('hook runner fails open on malformed stdin', async () => {
  let stdout = '';
  let stderr = '';
  const output = new Writable({ write(chunk, encoding, callback) { stdout += chunk.toString(); callback(); } });
  const error = new Writable({ write(chunk, encoding, callback) { stderr += chunk.toString(); callback(); } });

  await runHookFromStdin({ input: Readable.from(['{not-json']), output, error, env: {} });

  assert.deepEqual(JSON.parse(stdout), { continue: true });
  assert.match(stderr, /codex-lattice hook:/);
});
