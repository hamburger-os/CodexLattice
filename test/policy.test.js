import test from 'node:test'; import assert from 'node:assert/strict';
import {analyzeTask,chooseRoute,buildPlan} from '../src/policy.js';
test('simple tasks do not over-route',()=>{const f=analyzeTask('fix a typo in README'); const r=chooseRoute('execute',f); assert.notEqual(r.model,'gpt-5.6-sol')});
test('high risk verification chooses strongest near-optimal path',()=>{const f={risk:.95,complexity:.8,parallelizability:.1}; const r=chooseRoute('verify',f); assert.equal(r.delta,0); assert.equal(r.model,'gpt-5.6-sol')});
test('parallel exploration is bounded',()=>{const p=buildPlan('compare multiple independent modules across several files'); assert.ok(p.stages.explore.parallelism<=3)});
