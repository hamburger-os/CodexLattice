import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonLines, readJson, validateResultRecord } from './eval-lib.mjs';
import { promotionDecision } from './evidence-lib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = { study: path.join(repoRoot, 'eval', 'study.json'), format: 'json' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--study') args.study = path.resolve(argv[++i]);
    else if (arg === '--format') args.format = argv[++i];
    else if (!args.file) args.file = path.resolve(arg);
    else throw new Error(`unexpected argument: ${arg}`);
  }
  if (!args.file) throw new Error('usage: node scripts/eval-promote.mjs <graded-results.jsonl> [--study FILE] [--format json|markdown]');
  if (!['json', 'markdown'].includes(args.format)) throw new Error('--format must be json or markdown');
  return args;
}

function percent(value) { return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'n/a'; }
function metric(value) { return Number.isFinite(value) ? value.toFixed(3) : 'n/a'; }

function markdown(decision) {
  const c = decision.summaries.candidate;
  const b = decision.summaries.baseline;
  const lines = [
    `# Promotion gate: ${decision.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`,
    '',
    `Study: \`${decision.studyVersion}\``,
    `Efficiency metric: \`${decision.efficiencyMetric}\``,
    '',
    '| | Candidate | Baseline |',
    '| --- | ---: | ---: |',
    `| Holdout trials | ${c.trials} | ${b.trials} |`,
    `| Pass rate | ${percent(c.passRate)} | ${percent(b.passRate)} |`,
    `| Wilson 95% low | ${percent(c.passWilson95.low)} | ${percent(b.passWilson95.low)} |`,
    `| Wilson 95% high | ${percent(c.passWilson95.high)} | ${percent(b.passWilson95.high)} |`,
    `| Mean human score | ${metric(c.meanScore)} | ${metric(b.meanScore)} |`,
    `| Human score coverage | ${percent(c.humanScoreCoverage)} | ${percent(b.humanScoreCoverage)} |`,
    `| Mean ${decision.efficiencyMetric} | ${metric(c.meanEfficiency)} | ${metric(b.meanEfficiency)} |`,
    `| Efficiency coverage | ${percent(c.efficiencyCoverage)} | ${percent(b.efficiencyCoverage)} |`,
    ''
  ];
  if (decision.reasons.length) {
    lines.push('## Blocking reasons', '');
    for (const reason of decision.reasons) lines.push(`- ${reason}`);
  }
  return lines.join('\n');
}

const args = parseArgs(process.argv.slice(2));
const corpus = readJson(path.join(repoRoot, 'eval', 'tasks.json'));
const runners = readJson(path.join(repoRoot, 'eval', 'runners.json'));
const study = readJson(args.study);
const results = parseJsonLines(fs.readFileSync(args.file, 'utf8'));
for (const row of results) validateResultRecord(row);
const decision = promotionDecision(results, study, corpus, runners);
console.log(args.format === 'markdown' ? markdown(decision) : JSON.stringify(decision, null, 2));
process.exitCode = decision.eligible ? 0 : 2;
