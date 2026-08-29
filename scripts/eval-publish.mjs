import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonLines, readJson, validateResultRecord } from './eval-lib.mjs';
import { sanitizeEvidence, validateStudy } from './evidence-lib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = { study: path.join(repoRoot, 'eval', 'study.json') };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--study') args.study = path.resolve(argv[++i]);
    else if (arg === '--out') args.out = path.resolve(argv[++i]);
    else if (!args.file) args.file = path.resolve(arg);
    else throw new Error(`unexpected argument: ${arg}`);
  }
  if (!args.file || !args.out) throw new Error('usage: node scripts/eval-publish.mjs <results.jsonl> --out <evidence.json> [--study FILE]');
  if (args.file === args.out) throw new Error('refusing to overwrite raw result input');
  return args;
}

const args = parseArgs(process.argv.slice(2));
const corpus = readJson(path.join(repoRoot, 'eval', 'tasks.json'));
const runners = readJson(path.join(repoRoot, 'eval', 'runners.json'));
const study = readJson(args.study);
validateStudy(study, corpus, runners);
const results = parseJsonLines(fs.readFileSync(args.file, 'utf8'));
for (const row of results) validateResultRecord(row);
const records = sanitizeEvidence(results, study);
const corpusVersions = [...new Set(records.map((row) => row.corpusVersion))];
const runnerConfigVersions = [...new Set(records.map((row) => row.runnerConfigVersion))];
if (corpusVersions.length !== 1 || runnerConfigVersions.length !== 1) throw new Error('public evidence set must not mix corpus or runner-config versions');
if (corpusVersions[0] !== corpus.version) throw new Error(`public evidence corpus version must match current corpus version ${corpus.version}`);
if (runnerConfigVersions[0] !== runners.version) throw new Error(`public evidence runner-config version must match current runner-config version ${runners.version}`);
const evidence = {
  schemaVersion: 'evidence-set-1',
  studyVersion: study.version,
  corpusVersion: corpusVersions[0],
  runnerConfigVersion: runnerConfigVersions[0],
  resultCount: records.length,
  records
};
fs.mkdirSync(path.dirname(args.out), { recursive: true });
fs.writeFileSync(args.out, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(`Wrote sanitized evidence set with ${records.length} records to ${args.out}`);
