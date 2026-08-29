# Evaluation and calibration protocol

CodexLattice is quality-first. Routing heuristics are therefore not treated as evidence of quality. The repository includes a reproducible paired-evaluation harness and fail-closed evidence controls, but no quality/cost claim becomes valid until authenticated trials are actually run, graded, and published with adequate coverage.

The evaluation tooling is a **source-checkout research surface**. It is maintained and tested in this repository; it is not required for the installed CodexLattice runtime package.

## What is implemented

The evaluation contract lives under `eval/` and `scripts/`:

- `eval/tasks.json`: versioned, self-contained seed corpus;
- `eval/runners.json`: versioned baseline runner matrix;
- `eval/study.json`: frozen calibration/holdout split, study seed, blind-grading seed, and promotion criteria;
- `eval/result.schema.json`: machine-readable raw result contract;
- `scripts/eval-validate.mjs`: validates corpus/runners/study and proves every seed task initially fails its deterministic checker;
- `scripts/eval-run.mjs`: isolated paired-run executor with explicit paid-call opt-in and deterministic seeded execution order;
- `scripts/eval-summarize.mjs`: aggregates pass rate, Wilson 95% intervals, duration, optional human scores, and only actually measured usage;
- `scripts/eval-blind.mjs`: builds anonymized grading workspaces and a separate de-blinding key without overwriting an existing blind bundle or key;
- `scripts/eval-apply-grades.mjs`: merges validated 0–4 blind human scores back into raw result records while rejecting duplicate or ambiguous grade mappings;
- `scripts/eval-promote.mjs`: evaluates holdout-only promotion criteria and exits non-zero when evidence is incomplete or regresses;
- `scripts/eval-publish.mjs`: exports a sanitized evidence set that omits raw artifact paths, execution errors, route traces, and reviewer notes and rejects mixed or stale corpus/runner versions;
- `test/evaluation.test.js` and `test/evidence.test.js`: regression tests for the evaluation and promotion contracts.

The seed corpus contains eight tasks: two each in `easy`, `medium`, `hard`, and `critical`. Tasks have no external dependencies or network setup, so the same starting state can be materialized repeatedly in a temporary workspace.

## Frozen study design

Study configuration version `1` fixes one task from each difficulty bucket for calibration and the other task for holdout. The two sets are disjoint and cover the full corpus exactly once.

The study file also freezes the randomization seed. A full study plan uses that seed to deterministically shuffle task/trial groups and the runner order within each group. Re-running the same corpus, runner config, study version, and trial count therefore produces the same planned order while avoiding a permanent runner-first ordering bias.

Changing the split, study seed, runner matrix, or promotion thresholds is a study-design change. Version the changed configuration and do not mix incompatible versions in one claimed aggregate.

## Validate without model calls

These commands are safe for CI and local development:

```bash
npm run eval:validate
npm run eval:plan -- --task easy-slugify --runner sol-medium
npm run eval:plan -- --all --trials 3
```

`eval:validate` checks structure, bucket coverage, the frozen calibration/holdout split, promotion policy, protected evaluator files, and that each seed task fails before any model touches it.

`eval:plan` is plan-only by default. It prints the seeded order and exact task/runner invocation configuration but does not call a model. CI validates both a single pair and a full seeded study plan without `--execute`.

## Explicit execution boundary

Actual execution requires `--execute`. To avoid accidental full-matrix spend, execution is rejected unless the caller supplies both `--task` and `--runner`, or deliberately supplies `--all`.

```bash
npm run eval:run -- --execute --task easy-slugify --runner sol-medium --trials 3

# Deliberate full paired study: authenticated model calls will occur.
npm run eval:run -- --execute --all --trials 3
```

CI never uses `--execute` and therefore never performs authenticated or paid benchmark calls.

Every trial receives a fresh temporary workspace. The model edits that workspace, then protected evaluator files such as `test.js` are restored to their canonical corpus content before grading. The result record reports whether a runner attempted to change a protected file. Promotion is blocked when any holdout record reports such a change.

The post-run workspace plus stdout/stderr are copied under ignored `eval/artifacts/` paths for inspection. Local JSONL output defaults to `eval/results/runs.jsonl`. Executed studies also receive an adjacent ignored manifest that records the study version, seed, corpus/runner versions, trial count, and planned order. A full `--all` execution refuses to append to a non-empty result file or reuse an existing adjacent manifest, so a new study cannot silently inherit rows from an older run.

## Runner matrix

The current paired baselines are:

| Runner | Execution |
| --- | --- |
| `adaptive` | CodexLattice adaptive orchestration |
| `sol-medium` | `gpt-5.6-sol`, medium reasoning |
| `sol-high` | `gpt-5.6-sol`, high reasoning |
| `terra-medium` | `gpt-5.6-terra`, medium reasoning |

Fixed baselines pin model and reasoning effort through the Codex CLI. Adaptive trials execute the CodexLattice CLI and retain normal fail-closed installation/receipt checks.

## Outcome grading and blinding

Deterministic checker pass/fail is the primary reproducible outcome for the seed corpus. Human grading supplements it where multiple implementations pass tests but differ materially in quality.

Prepare a blind bundle after execution:

```bash
npm run eval:blind -- eval/results/runs.jsonl \
  --out eval/blind/study-1 \
  --key eval/grades/study-1-key.local.json
```

The blind directory contains anonymized workspaces and a grading manifest with task context but no runner/model label. Keep the key file away from graders. Stdout/stderr are intentionally excluded from the blind bundle because they can leak model or orchestration identity. Both the blind output directory and mapping-key path must be fresh: the command refuses to overwrite either one.

Use a 0–4 score with these dimensions as the review guide:

- correctness beyond the visible tests;
- scope discipline / minimal unrelated changes;
- maintainability and clarity;
- risk handling and fail-closed behavior where applicable.

A grades file uses `schemaVersion: "blind-grades-1"` and entries such as `{ "blindId": "...", "score": 4, "humanLabel": "pass" }`. Merge it without exposing the runner mapping to the grader:

```bash
npm run eval:grade -- eval/results/runs.jsonl \
  --key eval/grades/study-1-key.local.json \
  --grades eval/grades/study-1.local.json \
  --out eval/results/study-1-graded.local.json
```

Grade application fails closed on duplicate blind IDs, duplicate or ambiguous blind-key mappings, duplicate raw run IDs, key entries that reference a run absent from the supplied result set, unknown blind IDs, or out-of-range scores. A later grade therefore cannot silently overwrite an earlier score for the same blind run.

Do not derive human scores from the routing heuristic or deterministic checker.

## Reporting uncertainty, usage, latency, and cost

`durationMs` is measured by the harness. The summarizer reports pass rate with a Wilson 95% confidence interval; this interval describes sampling uncertainty in pass/fail only and is not a confidence interval for human score, latency, or cost.

```bash
npm run eval:summarize -- eval/results/study-1-graded.local.json --format markdown
```

Usage fields remain nullable by design. If the installed Codex surface exposes trustworthy per-run token/usage data, record those measured values. Until then, do not backfill token counts from heuristic route costs and do not convert nominal policy cost indices into dollars.

The summarizer reports usage coverage so a cost/token aggregate cannot silently appear complete when usage coverage is partial.

## Fail-closed promotion gate

The current study compares the `adaptive` candidate against `sol-high` on the **holdout split only**. The calibration split exists for future threshold tuning; it is not accepted as promotion evidence.

Run the gate only after blind grades and measured usage have been merged:

```bash
npm run eval:promote -- eval/results/study-1-graded.local.json --format markdown
```

Study version `1` requires all of the following before returning exit code `0`:

- at least three distinct holdout trials for every holdout task for both `adaptive` and `sol-high`;
- evidence records must use exactly the current corpus version and current runner-config version;
- no duplicate run IDs or duplicate task/runner/trial records;
- candidate and baseline trial numbers must be paired for each holdout task, with matching Node/Codex/CodexLattice/platform/architecture environment metadata inside each pair;
- no protected evaluator-file modifications or timed-out holdout runs;
- no allowed pass-rate drop overall or in any difficulty bucket;
- complete human-score coverage and no allowed mean-score drop overall or by bucket;
- no paired regression on the critical holdout task;
- complete measured `reasoningTokens` coverage for candidate and baseline;
- candidate mean measured reasoning tokens at most 95% of the baseline mean.

These thresholds are deliberately conservative. In particular, if trustworthy `reasoningTokens` are unavailable, the gate remains **not eligible** rather than substituting heuristic cost indices. A failed or incomplete gate never mutates `src/policy.js` and never changes the default route.

If a future study chooses a different efficiency metric or non-inferiority margin, change and version the study contract before collecting/using the new evidence.

## Sanitize before publication

Raw artifacts may contain local paths, model output, private prompts, reviewer notes, or unrelated repository content. Do not publish the raw JSONL/artifact directory directly.

Create a stripped evidence file:

```bash
npm run eval:publish -- eval/results/study-1-graded.local.json \
  --out eval/published/study-1.local.json
```

The exporter keeps study/corpus/runner versions, task/runner/trial identity, deterministic outcomes, environment metadata, measured usage, and numeric human score. It removes raw artifact paths, execution error text, route traces, and human notes. It refuses to mix corpus/runner versions and also refuses a single internally consistent but stale corpus or runner-config version: a public evidence artifact for the current study must match the repository's current corpus and runner configuration. Review the generated file manually before changing `.local.json` to a committed/public evidence artifact.

## Calibration policy

The seed quality values in `src/policy.js` are ranking heuristics, not probabilities. Calibration may happen only after a sufficiently broad paired dataset exists.

A conservative update procedure is:

1. freeze and version corpus, runners, study split, and promotion criteria before tuning;
2. collect repeated paired outcomes across all buckets using the seeded order;
3. tune quality-gap tolerances or route thresholds only on calibration tasks;
4. freeze the candidate policy before examining holdout results;
5. run/grade the holdout set against the stronger baseline;
6. require the fail-closed promotion gate to pass;
7. make any policy change in a separate reviewed PR with the cited immutable evidence set.

No fixed savings, speedup, or quality-preservation percentage should appear in project marketing until the corresponding versioned result set and methodology are public and reproducible.

## Publication checklist

Before committing a public evidence set:

- remove private prompts, credentials, absolute local paths, and unrelated repository content;
- identify Codex, CodexLattice, corpus, runner-config, and study versions and confirm the corpus/runner versions match the current frozen study inputs;
- state trial count, seeded-order procedure, and missing-run handling;
- publish deterministic pass rate by bucket with uncertainty;
- state the blind human-grading rubric and grading coverage;
- report measured usage coverage before token/cost aggregates;
- publish the promotion-gate decision and all blocking reasons if it did not pass;
- preserve enough sanitized evidence for audit without leaking private data;
- keep any result set cited by a release or README claim immutable.
