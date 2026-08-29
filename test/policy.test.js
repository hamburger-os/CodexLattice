import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTask, chooseRoute, buildPlan, shadowComparison } from '../src/policy.js';

test('simple tasks do not over-route', () => {
  const f = analyzeTask('fix a typo in README');
  const r = chooseRoute('execute', f);
  assert.notEqual(r.model, 'gpt-5.6-sol');
});

test('high risk verification uses zero quality tolerance and Sol', () => {
  const f = { risk: .95, complexity: .8, parallelizability: .1, critical: false };
  const r = chooseRoute('verify', f);
  assert.equal(r.delta, 0);
  assert.equal(r.model, 'gpt-5.6-sol');
});

test('critical planning unlocks max as a candidate without forcing it', () => {
  const f = { risk: .98, complexity: .9, parallelizability: .2, critical: true };
  const r = chooseRoute('plan', f, { includeTrace: true });
  assert.equal(r.model, 'gpt-5.6-sol');
  assert.ok(r.candidates.some((c) => c.effort === 'max'));
});

test('trace explains why weaker candidates were rejected', () => {
  const f = { risk: .9, complexity: .8, parallelizability: .1, critical: false };
  const r = chooseRoute('verify', f, { includeTrace: true });
  assert.ok(r.candidates.some((c) => c.eligible === false && c.rejectionReason));
});

test('parallel exploration is bounded', () => {
  const p = buildPlan('compare multiple independent modules across several files');
  assert.ok(p.stages.explore.parallelism <= 3);
});

test('shadow comparison never claims measured savings', () => {
  const s = shadowComparison('refactor authentication across several modules');
  assert.equal(s.mode, 'counterfactual-shadow');
  assert.match(s.warning, /Do not treat heuristic/);
});
