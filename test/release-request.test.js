import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTargetMetadata, validateReleaseRequest } from '../scripts/release-request.mjs';

test('release request validates stable version, full SHA, and filename', () => {
  const request = validateReleaseRequest({
    version: '0.2.6',
    targetSha: 'ebf1273cbf6792a1d387edea3d02561edac5eab5'
  }, 'v0.2.6.json');
  assert.equal(request.tag, 'v0.2.6');
});

test('release request rejects unexpected fields and filename drift', () => {
  assert.throws(() => validateReleaseRequest({ version: '0.2.6', targetSha: 'a'.repeat(40), force: true }, 'v0.2.6.json'), /only version and targetSha/);
  assert.throws(() => validateReleaseRequest({ version: '0.2.6', targetSha: 'a'.repeat(40) }, 'v0.2.7.json'), /filename must be v0\.2\.6\.json/);
});

test('target metadata must match version and changelog heading', () => {
  const request = validateReleaseRequest({ version: '0.2.6', targetSha: 'a'.repeat(40) }, 'v0.2.6.json');
  assert.doesNotThrow(() => assertTargetMetadata(request, '{"version":"0.2.6"}', '# Changelog\n\n## 0.2.6\n'));
  assert.throws(() => assertTargetMetadata(request, '{"version":"0.2.5"}', '## 0.2.6\n'), /does not match/);
  assert.throws(() => assertTargetMetadata(request, '{"version":"0.2.6"}', '## 0.2.5\n'), /no release heading/);
});
