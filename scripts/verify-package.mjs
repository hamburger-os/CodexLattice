import { execFileSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const output = execFileSync(npm, ['pack', '--dry-run', '--json'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
});

const [pack] = JSON.parse(output);
if (!pack || !Array.isArray(pack.files)) {
  throw new Error('npm pack --dry-run --json did not return a file manifest');
}

const files = new Set(pack.files.map((entry) => entry.path));
const required = [
  'package.json',
  'bin/codex-lattice.js',
  'src/codex.js',
  'src/installer.js',
  'src/policy.js',
  'src/roles.js',
  'src/runtime.js',
  'src/telemetry.js',
  'presets/quality-first.json',
  'docs/installation.md',
  'README.md',
  'README.zh-CN.md',
  'LICENSE',
];

for (const path of required) {
  if (!files.has(path)) throw new Error(`release package is missing required file: ${path}`);
}

const forbiddenPrefixes = ['test/', '.github/', '.git/'];
for (const path of files) {
  if (forbiddenPrefixes.some((prefix) => path.startsWith(prefix))) {
    throw new Error(`release package unexpectedly contains: ${path}`);
  }
}

console.log(`Verified npm package manifest: ${pack.files.length} files, ${pack.unpackedSize} unpacked bytes.`);
