import fs from 'node:fs';
import path from 'node:path';
import { parseJsonLines, summarizeResults } from './eval-lib.mjs';

function parseArgs(argv) {
  const args = { format: 'json' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--format') args.format = argv[++i];
    else if (!args.file) args.file = arg;
    else throw new Error(`unexpected argument: ${arg}`);
  }
  if (!args.file) throw new Error('usage: node scripts/eval-summarize.mjs <results.jsonl> [--format json|markdown]');
  if (!['json', 'markdown'].includes(args.format)) throw new Error('--format must be json or markdown');
  return args;
}

function number(value, digits = 1) { return Number.isFinite(value) ? Number(value).toFixed(digits) : 'n/a'; }

function markdown(rows) {
  const lines = ['| Runner | Bucket | Trials | Pass rate | Median ms | Mean score | Usage coverage |', '| --- | --- | ---: | ---: | ---: | ---: | ---: |'];
  for (const row of rows) lines.push(`| ${row.runnerId} | ${row.bucket} | ${row.trials} | ${number(row.passRate * 100)}% | ${number(row.medianDurationMs, 0)} | ${number(row.meanScore, 3)} | ${row.usageAvailableTrials}/${row.trials} |`);
  lines.push('', '> Token/cost totals are meaningful only for rows with non-zero usage coverage. Missing usage is reported as missing rather than estimated.');
  return lines.join('\n');
}

const args = parseArgs(process.argv.slice(2));
const file = path.resolve(args.file);
const results = parseJsonLines(fs.readFileSync(file, 'utf8'));
const summary = summarizeResults(results);
console.log(args.format === 'markdown' ? markdown(summary) : JSON.stringify({ source: file, resultCount: results.length, summary }, null, 2));
