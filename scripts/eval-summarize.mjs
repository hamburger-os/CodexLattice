import fs from 'node:fs';
import path from 'node:path';
import { parseJsonLines, summarizeResults } from './eval-lib.mjs';
import { wilsonInterval } from './evidence-lib.mjs';

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
function percent(value) { return Number.isFinite(value) ? `${number(value * 100)}%` : 'n/a'; }

function enrich(rows) {
  return rows.map((row) => ({ ...row, passWilson95: wilsonInterval(row.passCount, row.trials) }));
}

function markdown(rows) {
  const lines = ['| Runner | Bucket | Trials | Pass rate | Wilson 95% | Median ms | Mean score | Usage coverage |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |'];
  for (const row of rows) {
    const interval = `${percent(row.passWilson95.low)}–${percent(row.passWilson95.high)}`;
    lines.push(`| ${row.runnerId} | ${row.bucket} | ${row.trials} | ${percent(row.passRate)} | ${interval} | ${number(row.medianDurationMs, 0)} | ${number(row.meanScore, 3)} | ${row.usageAvailableTrials}/${row.trials} |`);
  }
  lines.push('', '> Wilson 95% describes pass-rate sampling uncertainty only. Token/cost totals are meaningful only for rows with non-zero usage coverage; missing usage is reported as missing rather than estimated.');
  return lines.join('\n');
}

const args = parseArgs(process.argv.slice(2));
const file = path.resolve(args.file);
const results = parseJsonLines(fs.readFileSync(file, 'utf8'));
const summary = enrich(summarizeResults(results));
console.log(args.format === 'markdown' ? markdown(summary) : JSON.stringify({ source: file, resultCount: results.length, summary }, null, 2));
