export const POLICY_VERSION = '0.2.0-seed';

export const MODEL_PRICING = {
  // USD per 1M tokens; snapshot is used only to rank nominal route cost.
  // Real spend depends on actual input/output/reasoning usage.
  'gpt-5.6-luna':  { input: 0.20, output: 1.20 },
  'gpt-5.6-terra': { input: 2.00, output: 12.00 },
  'gpt-5.6-sol':   { input: 4.00, output: 20.00 }
};

const EFFORT_COST_FACTOR = {
  none: 0.75,
  low: 0.88,
  medium: 1.00,
  high: 1.32,
  xhigh: 1.72,
  max: 2.20
};

function nominalCost(model, effort) {
  const p = MODEL_PRICING[model];
  return Number(((p.input + p.output) * EFFORT_COST_FACTOR[effort]).toFixed(3));
}

function route(model, effort, latency) {
  return { model, effort, cost: nominalCost(model, effort), latency };
}

export const ROUTES = {
  lunaLow:   route('gpt-5.6-luna',  'low',    1),
  lunaMed:   route('gpt-5.6-luna',  'medium', 2),
  terraMed:  route('gpt-5.6-terra', 'medium', 4),
  terraHigh: route('gpt-5.6-terra', 'high',   6),
  solMed:    route('gpt-5.6-sol',   'medium', 7),
  solHigh:   route('gpt-5.6-sol',   'high',  10),
  solXHigh:  route('gpt-5.6-sol',   'xhigh', 15),
  solMax:    route('gpt-5.6-sol',   'max',   22)
};

export function analyzeTask(text = '') {
  const s = text.toLowerCase();
  const riskTerms = [
    'security','auth','authorization','payment','migration','database','production','crypto','credential','permission',
    '权限','安全','支付','迁移','数据库','生产','鉴权','凭据'
  ];
  const criticalTerms = [
    'critical','incident','outage','data loss','destructive','irreversible','vulnerability','exploit','prod hotfix',
    '严重','事故','宕机','数据丢失','不可逆','漏洞','线上热修'
  ];
  const complexTerms = [
    'architecture','refactor','concurrency','distributed','race','performance','compiler','protocol','cross-module',
    '跨模块','架构','重构','并发','性能','编译器','协议'
  ];
  const parallelTerms = ['multiple','several','across','compare','independent','并行','多个','多文件','分别','对比'];
  const simpleTerms = ['rename','format','typo','lint','comment','copy edit','文案','改名','格式','拼写','注释'];
  const score = (terms) => terms.filter((t) => s.includes(t)).length;

  const criticalSignals = score(criticalTerms);
  const risk = Math.min(1,
    score(riskTerms) * 0.24 +
    criticalSignals * 0.32 +
    (s.length > 1800 ? 0.15 : 0)
  );
  const complexity = Math.min(1,
    0.18 +
    score(complexTerms) * 0.18 +
    (s.length > 800 ? 0.18 : 0) -
    score(simpleTerms) * 0.15
  );
  const parallel = Math.min(1,
    0.15 +
    score(parallelTerms) * 0.22 +
    (s.length > 1200 ? 0.12 : 0)
  );

  return {
    risk,
    complexity: Math.max(0, complexity),
    parallelizability: parallel,
    critical: criticalSignals > 0 || (risk >= 0.9 && complexity >= 0.65)
  };
}

function qualityAdjusted(candidate, f, stage) {
  const tier = candidate.model.endsWith('sol') ? 3 : candidate.model.endsWith('terra') ? 2 : 1;
  const effortBoost = ({ low: 0, medium: 0.006, high: 0.014, xhigh: 0.020, max: 0.024 })[candidate.effort] || 0;

  // Task-conditioned seed model. It is deliberately transparent and must be
  // replaced/calibrated with measured outcomes as telemetry grows.
  let q;
  if (f.complexity < 0.30 && f.risk < 0.25) {
    q = tier === 1 ? 0.975 : tier === 2 ? 0.985 : 0.990;
  } else if (f.complexity < 0.62 && f.risk < 0.55) {
    q = tier === 1 ? 0.900 : tier === 2 ? 0.965 : 0.980;
  } else {
    q = tier === 1 ? 0.720 : tier === 2 ? 0.900 : 0.975;
  }

  if (stage === 'verify') q += tier === 3 ? 0.006 : tier === 2 ? 0.002 : -0.010;
  if (stage === 'plan' && f.complexity >= 0.68) q += tier === 3 ? 0.004 : 0;
  if (f.risk > 0.70 && tier < 3) q -= tier === 2 ? 0.060 : 0.180;
  if (f.critical && tier < 3) q -= 0.120;
  q += effortBoost;

  return Math.max(0, Math.min(0.999, q));
}

function routeKeys(stage, features) {
  if (stage === 'explore') return ['lunaLow','lunaMed','terraMed'];
  if (stage === 'execute') return ['lunaMed','terraMed','terraHigh','solMed','solHigh'];
  if (stage === 'plan') {
    return features.critical
      ? ['terraMed','terraHigh','solMed','solHigh','solXHigh','solMax']
      : ['terraMed','terraHigh','solMed','solHigh','solXHigh'];
  }
  if (stage === 'verify') {
    return features.critical
      ? ['terraHigh','solMed','solHigh','solXHigh','solMax']
      : ['terraHigh','solMed','solHigh','solXHigh'];
  }
  throw new Error(`unknown stage: ${stage}`);
}

// Quality-first lexicographic selector:
// 1) maximize predicted quality; 2) keep only routes within delta of Q*;
// 3) minimize nominal cost; 4) minimize latency.
export function chooseRoute(stage, features, { delta = 0.02, includeTrace = false } = {}) {
  if (features.risk >= 0.8) delta = 0;
  const candidates = routeKeys(stage, features).map((key) => ({
    key,
    ...ROUTES[key],
    quality: qualityAdjusted(ROUTES[key], features, stage)
  }));
  const qStar = Math.max(...candidates.map((c) => c.quality));
  const annotated = candidates.map((c) => {
    const qualityGap = Number((qStar - c.quality).toFixed(6));
    const eligible = c.quality >= qStar - delta;
    return {
      ...c,
      qualityGap,
      eligible,
      rejectionReason: eligible ? null : `quality gap ${qualityGap} exceeds delta ${delta}`
    };
  });
  const nearOptimal = annotated.filter((c) => c.eligible)
    .sort((a, b) => a.cost - b.cost || a.latency - b.latency || b.quality - a.quality);
  const selected = nearOptimal[0];
  const result = {
    ...selected,
    qStar,
    delta,
    selectionReason: `cheapest route inside the quality floor Q* - delta = ${(qStar - delta).toFixed(3)}`
  };
  if (includeTrace) result.candidates = annotated;
  return result;
}

export function buildPlan(task, options = {}) {
  const features = analyzeTask(task);
  const high = features.complexity >= 0.68 || features.risk >= 0.62;
  const routeOptions = { delta: options.delta, includeTrace: Boolean(options.includeTrace) };
  const plan = chooseRoute('plan', features, routeOptions);
  const execute = chooseRoute('execute', features, routeOptions);
  const verify = chooseRoute('verify', features, routeOptions);
  const explorer = chooseRoute('explore', features, routeOptions);
  const parallelExplorers = features.parallelizability >= 0.55 ? 3 : features.parallelizability >= 0.32 ? 2 : 1;

  return {
    policyVersion: POLICY_VERSION,
    objective: 'maximize predicted quality; minimize nominal cost then latency inside the near-optimal quality set',
    features,
    stages: {
      plan,
      explore: { ...explorer, parallelism: parallelExplorers },
      execute: { ...execute, parallelism: high && features.parallelizability > 0.62 ? 2 : 1 },
      verify
    },
    escalation: [
      'deterministic validation fails',
      'two agents materially disagree',
      'planner reports unresolved ambiguity',
      'security/production/critical risk is detected'
    ],
    caveats: [
      'quality values are seed heuristics, not calibrated probabilities',
      'cost is a nominal ranking index derived from public model token prices and an effort multiplier, not a bill estimate'
    ]
  };
}

export function shadowComparison(task) {
  const adaptive = buildPlan(task, { includeTrace: true });
  return {
    mode: 'counterfactual-shadow',
    policyVersion: POLICY_VERSION,
    baseline: {
      mode: 'single-agent',
      model: 'gpt-5.6-sol',
      effort: 'medium',
      note: 'reference baseline only; shadow mode does not execute either route'
    },
    adaptive,
    warning: 'Do not treat heuristic quality/cost fields as measured savings. Use paired evals before making performance claims.'
  };
}
