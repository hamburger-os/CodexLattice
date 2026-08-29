import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function validateReleaseRequest(request, sourceName = 'request.json') {
  assert(isPlainObject(request), `${sourceName}: request must be an object`);
  const keys = Object.keys(request).sort();
  assert(keys.join(',') === 'targetSha,version', `${sourceName}: only version and targetSha are allowed`);
  assert(/^\d+\.\d+\.\d+$/.test(request.version || ''), `${sourceName}: version must be stable semver x.y.z`);
  assert(/^[0-9a-f]{40}$/.test(request.targetSha || ''), `${sourceName}: targetSha must be a full lowercase 40-character commit SHA`);
  const tag = `v${request.version}`;
  assert(path.basename(sourceName) === `${tag}.json`, `${sourceName}: filename must be ${tag}.json`);
  return { version: request.version, targetSha: request.targetSha, tag };
}

export function assertTargetMetadata(request, packageJsonText, changelogText) {
  let pkg;
  try {
    pkg = JSON.parse(packageJsonText);
  } catch (error) {
    throw new Error(`${request.tag}: target package.json is invalid JSON: ${error.message}`);
  }
  assert(pkg?.version === request.version, `${request.tag}: target package version ${pkg?.version ?? 'missing'} does not match request ${request.version}`);
  const heading = new RegExp(`^##\\s+${escapeRegExp(request.version)}\\s*$`, 'm');
  assert(heading.test(String(changelogText)), `${request.tag}: CHANGELOG.md has no release heading for ${request.version}`);
}

function git(repoRoot, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true
  });
  if (!allowFailure && result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim() || `exit ${result.status}`;
    throw new Error(`git ${args.join(' ')} failed: ${detail}`);
  }
  return result;
}

function parseArgs(argv) {
  const options = {
    apply: false,
    requestDir: path.join(process.cwd(), '.github', 'release-requests'),
    output: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--request-dir') options.requestDir = path.resolve(argv[++index]);
    else if (arg === '--output') options.output = path.resolve(argv[++index]);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

export function planReleaseRequests({ repoRoot = process.cwd(), requestDir = path.join(repoRoot, '.github', 'release-requests') } = {}) {
  assert(fs.existsSync(requestDir), `release request directory does not exist: ${requestDir}`);
  const files = fs.readdirSync(requestDir).filter((name) => /^v\d+\.\d+\.\d+\.json$/.test(name)).sort();
  assert(files.length > 0, `no release request JSON files found in ${requestDir}`);

  return files.map((file) => {
    const fullPath = path.join(requestDir, file);
    const request = validateReleaseRequest(JSON.parse(fs.readFileSync(fullPath, 'utf8')), file);

    const commitCheck = git(repoRoot, ['cat-file', '-e', `${request.targetSha}^{commit}`], { allowFailure: true });
    assert(commitCheck.status === 0, `${request.tag}: target commit does not exist locally`);

    const ancestor = git(repoRoot, ['merge-base', '--is-ancestor', request.targetSha, 'HEAD'], { allowFailure: true });
    assert(ancestor.status === 0, `${request.tag}: target commit is not an ancestor of reviewed HEAD`);

    const packageText = git(repoRoot, ['show', `${request.targetSha}:package.json`]).stdout;
    const changelogText = git(repoRoot, ['show', `${request.targetSha}:CHANGELOG.md`]).stdout;
    assertTargetMetadata(request, packageText, changelogText);

    const existing = git(repoRoot, ['rev-parse', '-q', '--verify', `refs/tags/${request.tag}^{}`], { allowFailure: true });
    const existingSha = existing.status === 0 ? String(existing.stdout || '').trim() : null;
    if (existingSha) {
      assert(existingSha === request.targetSha, `${request.tag}: existing tag points to ${existingSha}, expected ${request.targetSha}`);
    }

    return { ...request, exists: Boolean(existingSha) };
  });
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const repoRoot = process.cwd();
  const plan = planReleaseRequests({ repoRoot, requestDir: options.requestDir });
  const created = [];

  for (const request of plan) {
    if (request.exists) {
      console.log(`[release-request] ${request.tag} already points to ${request.targetSha}; no-op`);
      continue;
    }
    if (!options.apply) {
      console.log(`[release-request] would create ${request.tag} -> ${request.targetSha}`);
      continue;
    }
    git(repoRoot, ['tag', '-a', request.tag, request.targetSha, '-m', `CodexLattice ${request.tag}`]);
    git(repoRoot, ['push', 'origin', `refs/tags/${request.tag}`]);
    created.push(request.tag);
    console.log(`[release-request] created ${request.tag} -> ${request.targetSha}`);
  }

  if (options.output) {
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, created.length ? `${created.join('\n')}\n` : '', 'utf8');
  }
  return created;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
