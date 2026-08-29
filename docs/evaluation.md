# Evaluation and calibration protocol

CodexLattice is quality-first. Routing heuristics are therefore not treated as evidence of quality. The repository now includes a reproducible paired-evaluation harness, but no quality/cost claim becomes valid until authenticated trials are actually run, graded, and published with adequate coverage.

## What is implemented

The evaluation contract lives under `eval/`:

- `tasks.json`: versioned, self-contained seed corpus;
- `runners.json`: versioned baseline runner matrix;
- `result.schema.json`: machine-readable result contract;
- `scripts/eval-validate.mjs`: validates corpus/runners and proves every seed task initially fails its deterministic checker;
- `scripts/eval-run.mjs`: isolated paired-run executor with explicit paid-call opt-in;
- `scripts/eval-summarize.mjs`: aggregates pass rate, duration, optional human scores, and only actually measured usage;
- `test/evaluation.test.js`: regression tests for the evaluation contract itself.

The seed corpus contains eight tasks: two each in `easy`, `medium`, `hard`, and `critical`. Tasks have no external dependencies or network setup, so the same starting state can be materialized repeatedly in a temporary workspace.

## Validate without model calls

These commands are safe for CI and local development:

```bash
npm run eval:validate
npm run eval:plan -- --task easy-slugify --runner sol-medium
```

`eval:validate` checks structure, bucket coverage, protected evaluator files, and that each seed task fails before any model touches it.

`eval:plan` is plan-only by default. It prints the exact task/runner combinations and invocation configuration but does not call a model.

## Explicit execution boundary

Actual execution requires `--execute`. To avoid accidental full-matrix spend, execution is rejected unless the caller supplies both `--task` and `--runner`, or deliberately supplies `--all`.

```bash
npm run eval:run -- --execute --task easy-slugify --runner sol-medium --trials 3
```

CI never uses `--execute` and therefore never performs authenticated or paid benchmark calls.

Every trial receives a fresh temporary workspace. The model edits that workspace, then protected evaluator files such as `test.js` are restored to their canonical corpus content before grading. The result record reports whether a runner attempted to change a protected file. This prevents a passing result from being created by weakening the checker.

The post-run workspace plus stdout/stderr are copied under ignored `eval/artifacts/` paths for human inspection. Local JSONL output defaults to `eval/results/runs.jsonl`, which is also ignored to reduce accidental publication of raw artifacts.

## Runner matrix

The current paired baselines are:

| Runner | Execution |
| --- | --- |
| `adaptive` | CodexLattice adaptive orchestration |
| `sol-medium` | `gpt-5.6-sol`, medium reasoning |
| `sol-high` | `gpt-5.6-sol`, high reasoning |
| `terra-medium` | `gpt-5.6-terra`, medium reasoning |

Fixed baselines pin model and reasoning effort through the Codex CLI. Adaptive trials execute the CodexLattice CLI and retain normal fail-closed installation/receipt checks.

The baseline matrix should stay stable for a published study. If it changes, bump the runner-config version and do not mix versions in the same aggregate without stratifying them.

## Paired study design

For each corpus task:

1. run every selected runner from the identical task seed;
2. randomize runner order when performing a real study so time/order effects do not systematically favor one route;
3. use multiple independent trials where model stochasticity matters (three is a minimum sanity check; more is preferred before publication);
4. grade deterministic checks before any subjective scoring;
5. keep environment metadata and runner/corpus versions with every result;
6. treat missing runs as missing data rather than failures or wins.

A public study should include all difficulty buckets and report per-bucket as well as overall aggregates. Critical tasks must not be diluted by a large number of easy tasks.

## Outcome grading

Deterministic checker pass/fail is the primary reproducible outcome for the seed corpus. For tasks where multiple implementations pass tests but differ materially in quality, add blind human grading after execution.

Suggested blind rubric dimensions (0–4 each):

- correctness beyond the visible tests;
- scope discipline / minimal unrelated changes;
- maintainability and clarity;
- risk handling and fail-closed behavior where applicable.

Reviewers should see anonymized artifacts without runner/model labels. Store human scores under the optional `outcome` object only after grading; never derive them from the routing heuristic.

## Usage, latency, and cost

`durationMs` is measured by the harness. Usage fields are nullable by design:

```json
{
  "usage": null
}
```

If the installed Codex surface later exposes trustworthy per-run token/usage data, record the measured values. Until then, do not backfill token counts from heuristic route costs and do not convert nominal policy cost indices into dollars.

The summarizer reports `usageAvailableTrials` so a cost/token aggregate cannot silently appear complete when usage coverage is partial.

```bash
npm run eval:summarize -- eval/results/runs.jsonl --format markdown
```

## Calibration policy

The seed quality values in `src/policy.js` are ranking heuristics, not probabilities. Calibration should happen only after a sufficiently broad paired dataset exists.

A conservative update procedure is:

1. freeze a corpus and runner config version;
2. collect paired outcomes across all buckets;
3. split calibration and holdout tasks before tuning thresholds;
4. tune quality-gap tolerances or route thresholds only on calibration data;
5. re-run the holdout set and compare against the quality ceiling baseline;
6. reject a cheaper policy change when quality degradation is material, especially on high-risk/critical tasks.

No fixed savings, speedup, or quality-preservation percentage should appear in project marketing until the corresponding versioned result set and methodology are public and reproducible.

## Publication checklist

Before committing a public evidence set:

- remove private prompts, credentials, absolute local paths, and unrelated repository content;
- identify Codex, CodexLattice, corpus, and runner-config versions;
- state trial count and missing-run handling;
- publish deterministic pass rate by bucket;
- state human-grading rubric and blinding procedure if used;
- report usage coverage before token/cost aggregates;
- preserve raw-enough sanitized artifacts for audit without leaking private data;
- keep the original result set immutable once cited by a release or README claim.
