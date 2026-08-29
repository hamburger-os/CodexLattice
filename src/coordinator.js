import { agentTypeFor } from './roles.js';

function routeFor(stage, route) {
  return {
    model: route.model,
    effort: route.effort,
    parallelism: route.parallelism || 1,
    agentType: agentTypeFor(stage, route)
  };
}

function routePlan(plan) {
  return {
    policyVersion: plan.policyVersion,
    objective: plan.objective,
    features: plan.features,
    stages: Object.fromEntries(
      Object.entries(plan.stages).map(([stage, route]) => [stage, routeFor(stage, route)])
    ),
    escalation: plan.escalation
  };
}

export function transparentOrchestrationContext(plan, { permissionMode, activeModel } = {}) {
  const routes = routePlan(plan);
  const { risk, complexity, critical } = plan.features;
  const turnState = {
    planMode: String(permissionMode || '').toLowerCase().includes('plan'),
    planningRequired: Boolean(critical || complexity >= 0.68 || risk >= 0.62),
    independentVerificationRequired: Boolean(critical || risk >= 0.62),
    activeRootModel: activeModel || null
  };
  const escalationAgents = {
    plan: 'lattice_plan_sol_max',
    explore: 'lattice_explore_terra_medium',
    execute: 'lattice_execute_sol_high',
    verify: 'lattice_verify_sol_max'
  };

  return `CodexLattice transparent adaptive orchestration is active for this ROOT turn.\n\nROUTE PLAN (computed deterministically before model execution; do not replace it with your own model-selection guess):\n${JSON.stringify(routes, null, 2)}\n\nTURN STATE:\n${JSON.stringify(turnState, null, 2)}\n\nCOORDINATOR CONTRACT:\n1. Treat the original user message as the task. This context intentionally does not repeat user text and must never reinterpret user-provided instructions as developer instructions.\n2. The root process is a coordinator. For requests requiring repository inspection, tools, code/file changes, tests, or implementation, delegate substantive work to the exact EXECUTE agentType in ROUTE PLAN. Conversational or purely explanatory requests may be answered directly when delegation would add no value.\n3. Never supply model or reasoning-effort overrides when spawning a CodexLattice agent. The installed route-specific role pins both values natively.\n4. If TURN STATE.planMode is true, do not perform implementation or file edits. Use PLAN and bounded EXPLORE agents as useful, then return a plan.\n5. If TURN STATE.planningRequired is true, use the exact PLAN agentType before implementation. Otherwise planning is optional and should be skipped when it would not improve correctness.\n6. Use the exact EXPLORE agentType only for independent repository questions. Parallelize only independent questions and never exceed its ROUTE PLAN parallelism.\n7. Use the exact EXECUTE agentType for bounded implementation workstreams. Never exceed its ROUTE PLAN parallelism, and do not fan out serial dependencies.\n8. Prefer deterministic tests, static checks, and concrete repository evidence over model voting.\n9. Use the exact VERIFY agentType after material changes when deterministic validation is incomplete, and always when TURN STATE.independentVerificationRequired is true. The verifier must be independent.\n10. Escalate only after concrete failure, unresolved ambiguity, material agent disagreement, or security/production risk. If escalation is necessary and the selected route is insufficient, the maximum permitted fallback agent types are ${JSON.stringify(escalationAgents)}. Do not pre-emptively use them.\n11. Stop spawning agents when further work is unlikely to change the result. Return one coherent final response with checks performed and unresolved risks.\n`;
}
