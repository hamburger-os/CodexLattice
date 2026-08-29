import { buildPlan } from './policy.js';
import { transparentOrchestrationContext } from './coordinator.js';

const USER_PROMPT_EVENT = 'UserPromptSubmit';

export function shouldRouteUserPrompt(input, env = process.env) {
  if (!input || typeof input !== 'object') return false;
  if (env.CODEX_LATTICE_BYPASS_HOOK === '1') return false;
  if (input.hook_event_name !== USER_PROMPT_EVENT && input.hookEventName !== USER_PROMPT_EVENT) return false;
  if (input.agent_id || input.agent_type) return false;
  if (typeof input.prompt !== 'string' || !input.prompt.trim()) return false;

  // Current Codex Desktop builds can emit UserPromptSubmit for internal,
  // non-resumable work that has no transcript. Fail open for those turns until
  // upstream exposes a first-class human/background origin discriminator.
  if (input.transcript_path === null && env.CODEX_LATTICE_ROUTE_EPHEMERAL !== '1') return false;
  return true;
}

export function handleUserPromptSubmit(input, { env = process.env } = {}) {
  if (!shouldRouteUserPrompt(input, env)) return { continue: true };

  const plan = buildPlan(input.prompt);
  return {
    continue: true,
    hookSpecificOutput: {
      hookEventName: USER_PROMPT_EVENT,
      // Deliberately do not copy the raw user prompt into developer context.
      // The model already receives the prompt in its original user role. Only
      // deterministic, derived routing metadata is elevated here.
      additionalContext: transparentOrchestrationContext(plan, {
        permissionMode: input.permission_mode,
        activeModel: input.model
      })
    }
  };
}

export async function runHookFromStdin({
  input = process.stdin,
  output = process.stdout,
  error = process.stderr,
  env = process.env
} = {}) {
  let raw = '';
  try {
    for await (const chunk of input) raw += chunk;
    const payload = JSON.parse(raw || '{}');
    output.write(`${JSON.stringify(handleUserPromptSubmit(payload, { env }))}\n`);
  } catch (cause) {
    // A routing extension must never make ordinary Codex unusable. Hook
    // failures therefore fail open and leave the turn to native Codex.
    error.write(`codex-lattice hook: ${cause?.message || String(cause)}\n`);
    output.write(`${JSON.stringify({ continue: true })}\n`);
  }
}
