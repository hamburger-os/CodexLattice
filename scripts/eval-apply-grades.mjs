import fs from 'node:fs';
import path from 'node:path';
import { parseJsonLines, validateResultRecord } from './eval-lib.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--key') args.key = path.resolve(argv[++i]);
    else if (arg === '--grades') args.grades = path.resolve(argv[++i]);
    else if (arg === '--out') args.out = path.resolve(argv[++i]);
    else if (!args.file) args.file = path.resolve(arg);
    else throw new Error(`unexpected argument: ${arg}`);
  }
  if (!args.file || !args.key || !args.grades || !args.out) throw new Error('usage: node scripts/eval-apply-grades.mjs <results.jsonl> --key <mapping-key.json> --grades <grades.json> --out <graded.jsonl>');
  if (args.file === args.out) throw new Error('refusing to overwrite raw result input');
  return args;
}

const args = parseArgs(process.argv.slice(2));
const results = parseJsonLines(fs.readFileSync(args.file, 'utf8'));
for (const row of results) validateResultRecord(row);
const key = JSON.parse(fs.readFileSync(args.key, 'utf8'));
const grades = JSON.parse(fs.readFileSync(args.grades, 'utf8'));
if (key.schemaVersion !== 'blind-key-1' || !Array.isArray(key.entries)) throw new Error('invalid blind key');
if (grades.schemaVersion !== 'blind-grades-1' || !Array.isArray(grades.entries)) throw new Error('invalid grades file');
const mapping = new Map(key.entries.map((entry) => [entry.blindId, entry]));
const gradeByRunId = new Map();
for (const grade of grades.entries) {
  if (gradeByRunId.has(grade.blindId)) throw new Error(`duplicate grade: ${grade.blindId}`);
  const mapped = mapping.get(grade.blindId);
  if (!mapped) throw new Error(`grade references unknown blindId: ${grade.blindId}`);
  if (!Number.isFinite(grade.score) || grade.score < 0 || grade.score > 4) throw new Error(`grade score must be 0..4: ${grade.blindId}`);
  if (grade.humanLabel !== undefined && grade.humanLabel !== null && typeof grade.humanLabel !== 'string') throw new Error(`humanLabel must be text or null: ${grade.blindId}`);
  gradeByRunId.set(mapped.runId, { score: grade.score, humanLabel: grade.humanLabel ?? null, notes: null });
}
const output = results.map((row) => gradeByRunId.has(row.runId) ? { ...row, outcome: gradeByRunId.get(row.runId) } : row);
fs.mkdirSync(path.dirname(args.out), { recursive: true });
fs.writeFileSync(args.out, `${output.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
console.log(`Applied ${gradeByRunId.size} blind grades to ${args.out}`);
