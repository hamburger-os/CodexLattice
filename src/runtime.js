function promptRoute(route) {
  return {
    model: route.model,
    effort: route.effort,
    parallelism: route.parallelism || 1
  };
}

export function orchestrationPrompt(task, plan) {
  const promptPlan = {
    policyVersion: plan.policyVersion,
    objective: plan.objective,
    features: plan.features,
    stages: Object.fromEntries(
      Object.entries(plan.stages).map(([stage, route]) => [stage, promptRoute(route)])
    ),
    escalation: plan.escalation
  };

  return `You are running under CodexLattice adaptive orchestration.\n\nUSER TASK:\n${task}\n\nROUTE PLAN (quality-first; cost minimized only inside the near-optimal quality set):\n${JSON.stringify(promptPlan, null, 2)}\n\nPOLICY:\n1. Preserve correctness and user requirements before optimizing cost.\n2. The root Codex process is already running with the EXECUTE route's model and reasoning effort.\n3. For any spawned lattice_* subagent, explicitly request that stage's model and reasoning effort from ROUTE PLAN. The role file supplies instructions only; do not rely on a model default from the role.\n4. Plan first for non-trivial work. Use lattice_planner when architectural ambiguity/risk justifies it.\n5. Use lattice_explorer in parallel only for independent repository questions; do not fan out serial dependencies.\n6. Use lattice_implementer for bounded workstreams. Prefer deterministic tests/static checks over model voting.\n7. Use lattice_reviewer for material changes or whenever deterministic validation is incomplete, agents disagree, or risk is elevated.\n8. Escalate model/effort only on evidence of failure, unresolved ambiguity, or high risk. Stop spawning agents when additional work is unlikely to change the result.\n9. If the task is simple, it is valid to do it directly without subagents.\n10. Return one coherent final result, including tests/checks performed and unresolved risks.\n`;
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
