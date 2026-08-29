import { agentTypeFor } from './roles.js';

function promptRoute(stage, route) {
  return {
    model: route.model,
    effort: route.effort,
    parallelism: route.parallelism || 1,
    agentType: agentTypeFor(stage, route)
  };
}

export function orchestrationPrompt(task, plan) {
  const promptPlan = {
    policyVersion: plan.policyVersion,
    objective: plan.objective,
    features: plan.features,
    stages: Object.fromEntries(
      Object.entries(plan.stages).map(([stage, route]) => [stage, promptRoute(stage, route)])
    ),
    escalation: plan.escalation
  };

  return `You are running under CodexLattice adaptive orchestration.\n\nUSER TASK:\n${task}\n\nROUTE PLAN (quality-first; cost minimized only inside the near-optimal quality set):\n${JSON.stringify(promptPlan, null, 2)}\n\nPOLICY:\n1. Preserve correctness and user requirements before optimizing cost.\n2. The root Codex process is already running with the EXECUTE route's model and reasoning effort.\n3. When spawning a CodexLattice subagent, use the exact agent_type listed for that stage in ROUTE PLAN. Do not supply a model or reasoning override at spawn time: the installed route-specific role pins both values natively.\n4. Plan first for non-trivial work. Spawn the PLAN agent type only when architecture, ambiguity, or risk justifies it.\n5. Explore in parallel only for independent repository questions, using the EXPLORE agent type and its bounded parallelism. Do not fan out serial dependencies.\n6. For bounded implementation workstreams, use the EXECUTE agent type. Prefer deterministic tests/static checks over model voting.\n7. For material changes or incomplete deterministic validation, use the VERIFY agent type for independent review.\n8. Escalate model/effort only on evidence of failure, unresolved ambiguity, or high risk. The route-specific agent types already encode the selected model/effort.\n9. Stop spawning agents when additional work is unlikely to change the result. If the task is simple, it is valid to do it directly without subagents.\n10. Return one coherent final result, including tests/checks performed and unresolved risks.\n`;
}

export function buildCodexExecArgs(task, plan) {
  const execute = plan.stages.execute;
  return [
    'exec',
    '--model', execute.model,
    '-c', `model_reasoning_effort=${JSON.stringify(execute.effort)}`,
    orchestrationPrompt(task, plan)
  ];
}
