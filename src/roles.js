import crypto from 'node:crypto';

const MODEL_TIER = Object.freeze({
  'gpt-5.6-sol': 'sol',
  'gpt-5.6-terra': 'terra',
  'gpt-5.6-luna': 'luna'
});

const STAGE_ROUTES = Object.freeze({
  plan: [
    ['gpt-5.6-terra', 'medium'],
    ['gpt-5.6-terra', 'high'],
    ['gpt-5.6-sol', 'medium'],
    ['gpt-5.6-sol', 'high'],
    ['gpt-5.6-sol', 'xhigh'],
    ['gpt-5.6-sol', 'max']
  ],
  explore: [
    ['gpt-5.6-luna', 'low'],
    ['gpt-5.6-luna', 'medium'],
    ['gpt-5.6-terra', 'medium']
  ],
  execute: [
    ['gpt-5.6-luna', 'medium'],
    ['gpt-5.6-terra', 'medium'],
    ['gpt-5.6-terra', 'high'],
    ['gpt-5.6-sol', 'medium'],
    ['gpt-5.6-sol', 'high']
  ],
  verify: [
    ['gpt-5.6-terra', 'high'],
    ['gpt-5.6-sol', 'medium'],
    ['gpt-5.6-sol', 'high'],
    ['gpt-5.6-sol', 'xhigh'],
    ['gpt-5.6-sol', 'max']
  ]
});

const STAGE_META = Object.freeze({
  plan: {
    description: 'Plan complex or ambiguous work before implementation.',
    instructions: `Act as the planning specialist. Clarify requirements from available evidence, inspect only what is necessary, identify architectural constraints and risks, decompose the work into bounded steps, and define deterministic validation and stop conditions. Do not edit files unless the parent task explicitly asks the planner to do so. Return a concise actionable plan with uncertainties.`
  },
  explore: {
    description: 'Bounded repository exploration; return evidence, paths and uncertainty.',
    instructions: `Act as a fast repository explorer. Investigate only the question assigned by the parent, cite concrete files/symbols/commands, distinguish observed facts from inference, and stop once enough evidence is gathered. Do not make code changes. Keep the result compact so the parent can combine multiple independent explorations.`
  },
  execute: {
    description: 'Implement one bounded workstream and validate it.',
    instructions: `Act as a bounded implementation specialist. Change only the assigned workstream, preserve existing behavior outside scope, prefer the smallest correct change, and run deterministic tests/static checks that are relevant to your edits. Report files changed, checks run, failures, and remaining risks. Do not broaden scope without evidence.`
  },
  verify: {
    description: 'Independent correctness, regression and security review.',
    instructions: `Act as an independent reviewer. Inspect the proposed implementation for correctness, regressions, security, data loss, incomplete requirements, and missing tests. Prefer deterministic evidence over model agreement. Do not rubber-stamp the implementation. Return findings ordered by severity, with file/symbol evidence and concrete remediation where possible.`
  }
});

function q(value) {
  return JSON.stringify(value);
}

export function agentTypeFor(stage, route) {
  const tier = MODEL_TIER[route?.model];
  if (!tier || !route?.effort || !STAGE_ROUTES[stage]) {
    throw new Error(`unsupported CodexLattice route for stage ${stage}`);
  }
  const supported = STAGE_ROUTES[stage].some(([model, effort]) => model === route.model && effort === route.effort);
  if (!supported) throw new Error(`unsupported CodexLattice route: ${stage} ${route.model}/${route.effort}`);
  return `lattice_${stage}_${tier}_${route.effort}`;
}

export function roleSpecs() {
  const specs = [];
  for (const [stage, routes] of Object.entries(STAGE_ROUTES)) {
    for (const [model, effort] of routes) {
      const tier = MODEL_TIER[model];
      const agentType = `lattice_${stage}_${tier}_${effort}`;
      specs.push({
        stage,
        model,
        effort,
        agentType,
        filename: `codex-lattice-${stage}-${tier}-${effort}.toml`,
        description: `${STAGE_META[stage].description} Route: ${model}/${effort}.`,
        developerInstructions: STAGE_META[stage].instructions
      });
    }
  }
  return specs;
}

export function renderRoleFile(spec) {
  return `model = ${q(spec.model)}\nmodel_reasoning_effort = ${q(spec.effort)}\ndeveloper_instructions = ${q(spec.developerInstructions)}\n`;
}

export function renderAgentRegistration(spec) {
  return `[agents.${spec.agentType}]\ndescription = ${q(spec.description)}\nconfig_file = ${q(`agents/${spec.filename}`)}`;
}

export function managedAgentBlock(startMarker, endMarker) {
  return `${startMarker}\n# CodexLattice adaptive mode: route-specific roles pin model + reasoning effort.\n${roleSpecs().map(renderAgentRegistration).join('\n\n')}\n${endMarker}`;
}

export function ownedAgentFilenames() {
  return [
    ...roleSpecs().map((spec) => spec.filename),
    // v0.1/v0.2 legacy files owned by CodexLattice and removed during migration/uninstall.
    'codex-lattice-explorer.toml',
    'codex-lattice-planner.toml',
    'codex-lattice-implementer.toml',
    'codex-lattice-reviewer.toml'
  ];
}

export function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}
