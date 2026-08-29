import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const role of ['explorer', 'planner', 'implementer', 'reviewer']) {
  test(`${role} role does not pin model or reasoning effort`, () => {
    const text = fs.readFileSync(new URL(`../agents/${role}.toml`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /^model\s*=/m);
    assert.doesNotMatch(text, /^model_reasoning_effort\s*=/m);
    assert.match(text, /^developer_instructions\s*=/m);
  });
}
