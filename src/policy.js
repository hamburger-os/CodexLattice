export const ROUTES = {
  lunaLow:  {model:'gpt-5.6-luna',  effort:'low',    q:0.72, cost:1, latency:1},
  lunaMed:  {model:'gpt-5.6-luna',  effort:'medium', q:0.78, cost:2, latency:2},
  terraMed: {model:'gpt-5.6-terra', effort:'medium', q:0.88, cost:6, latency:4},
  terraHigh:{model:'gpt-5.6-terra', effort:'high',   q:0.92, cost:9, latency:6},
  solMed:   {model:'gpt-5.6-sol',   effort:'medium', q:0.94, cost:11,latency:7},
  solHigh:  {model:'gpt-5.6-sol',   effort:'high',   q:0.97, cost:16,latency:10},
  solXHigh: {model:'gpt-5.6-sol',   effort:'xhigh',  q:0.985,cost:23,latency:15}
};

export function analyzeTask(text='') {
  const s = text.toLowerCase();
  const riskTerms = ['security','auth','payment','migration','database','production','crypto','权限','安全','支付','迁移','数据库','生产'];
  const complexTerms = ['architecture','refactor','concurrency','distributed','race','performance','跨模块','架构','重构','并发','性能'];
  const parallelTerms = ['multiple','several','across','compare','independent','并行','多个','多文件','分别'];
  const simpleTerms = ['rename','format','typo','lint','comment','文案','改名','格式','拼写'];
  const score = (terms) => terms.filter(t=>s.includes(t)).length;
  const risk = Math.min(1, score(riskTerms)*0.28 + (s.length>1800?0.15:0));
  const complexity = Math.min(1, 0.18 + score(complexTerms)*0.18 + (s.length>800?0.18:0) - score(simpleTerms)*0.15);
  const parallel = Math.min(1, 0.15 + score(parallelTerms)*0.22 + (s.length>1200?0.12:0));
  return {risk, complexity:Math.max(0,complexity), parallelizability:parallel};
}

function qualityAdjusted(route, f, stage) {
  const tier = route.model.endsWith('sol') ? 3 : route.model.endsWith('terra') ? 2 : 1;
  const effortBoost = ({low:0, medium:0.006, high:0.014, xhigh:0.020})[route.effort] || 0;
  let q;
  if (f.complexity < 0.30 && f.risk < 0.25) q = tier === 1 ? 0.975 : tier === 2 ? 0.985 : 0.990;
  else if (f.complexity < 0.62 && f.risk < 0.55) q = tier === 1 ? 0.90 : tier === 2 ? 0.965 : 0.980;
  else q = tier === 1 ? 0.72 : tier === 2 ? 0.90 : 0.975;
  if (stage === 'verify') q += tier === 3 ? 0.006 : tier === 2 ? 0.002 : -0.01;
  if (f.risk > 0.70 && tier < 3) q -= tier === 2 ? 0.06 : 0.18;
  q += effortBoost;
  return Math.max(0, Math.min(0.999, q));
}

export function chooseRoute(stage, features, {delta=0.02}={}) {
  if (features.risk >= 0.8) delta = 0;
  let keys = Object.keys(ROUTES);
  if (stage === 'explore') keys = ['lunaLow','lunaMed','terraMed'];
  if (stage === 'execute') keys = ['lunaMed','terraMed','terraHigh','solMed','solHigh'];
  if (stage === 'plan') keys = ['terraMed','terraHigh','solMed','solHigh','solXHigh'];
  if (stage === 'verify') keys = ['terraHigh','solMed','solHigh','solXHigh'];
  const candidates = keys.map(k=>({key:k,...ROUTES[k],quality:qualityAdjusted(ROUTES[k],features,stage)}));
  const qStar = Math.max(...candidates.map(c=>c.quality));
  const nearOptimal = candidates.filter(c=>c.quality >= qStar-delta)
    .sort((a,b)=>a.cost-b.cost || a.latency-b.latency || b.quality-a.quality);
  return {...nearOptimal[0], qStar, delta};
}

export function buildPlan(task, options={}) {
  const f = analyzeTask(task);
  const high = f.complexity >= 0.68 || f.risk >= 0.62;
  const plan = chooseRoute('plan', f, options);
  const execute = chooseRoute('execute', f, options);
  const verify = chooseRoute('verify', f, options);
  const explorer = chooseRoute('explore', f, options);
  const parallelExplorers = f.parallelizability >= 0.55 ? 3 : f.parallelizability >= 0.32 ? 2 : 1;
  return {features:f,stages:{plan,explore:{...explorer,parallelism:parallelExplorers},execute:{...execute,parallelism:high&&f.parallelizability>0.62?2:1},verify},escalation:['deterministic validation fails','two agents materially disagree','planner reports unresolved ambiguity','security/production risk is detected']};
}
