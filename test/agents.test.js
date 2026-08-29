import test from 'node:test';
import assert from 'node:assert/strict';
import { agentTypeFor, renderRoleFile, roleSpecs } from '../src/roles.js';

test('route-specific roles pin model and reasoning effort natively', () => {
  const specs = roleSpecs();
  assert.ok(specs.length >= 15);
  for (const spec of specs) {
    const text = renderRoleFile(spec);
    assert.match(text, new RegExp(`model = ${JSON.stringify(spec.model).replaceAll('.', '\\.')}`));
    assert.match(text, new RegExp(`model_reasoning_effort = ${JSON.stringify(spec.effort)}`));
    assert.match(text, /^developer_instructions\s*=/m);
  }
});

test('every policy stage has deterministic agent type names', () => {
  assert.equal(agentTypeFor('plan', { model: 'gpt-5.6-sol', effort: 'high' }), 'lattice_plan_sol_high');
  assert.equal(agentTypeFor('explore', { model: 'gpt-5.6-luna', effort: 'low' }), 'lattice_explore_luna_low');
  assert.equal(agentTypeFor('execute', { model: 'gpt-5.6-terra', effort: 'medium' }), 'lattice_execute_terra_medium');
  assert.equal(agentTypeFor('verify', { model: 'gpt-5.6-sol', effort: 'max' }), 'lattice_verify_sol_max');
});
