# Evaluation harness

This directory contains the reproducible evaluation contract for CodexLattice. It is infrastructure for collecting evidence; it is not evidence by itself.

## Seed corpus

`tasks.json` contains eight self-contained coding tasks: two each in `easy`, `medium`, `hard`, and `critical`. Every task materializes into an isolated temporary workspace and starts in a state that fails its deterministic checker. The corpus intentionally has no external dependencies or network fetches.

Validate the corpus and runner definitions without making model calls:

```bash
npm run eval:validate
npm run eval:plan -- --task easy-slugify --runner sol-medium
```

## Runner matrix

`runners.json` defines four paired baselines:

- `adaptive`: CodexLattice adaptive orchestration;
- `sol-medium`: GPT-5.6 Sol, medium reasoning;
- `sol-high`: GPT-5.6 Sol, high reasoning;
- `terra-medium`: GPT-5.6 Terra, medium reasoning.

Fixed baselines call Codex with explicit model/reasoning configuration. Adaptive trials call the installed CodexLattice CLI, which retains its normal fail-closed installation checks.

## Explicit execution safety

`eval:run` defaults to plan-only mode. It will not make model calls unless `--execute` is supplied. Even with `--execute`, a full matrix is refused unless the caller explicitly supplies `--all`; otherwise both a task and runner are required.

Example single pair with three repeated trials:

```bash
npm run eval:run -- --execute --task easy-slugify --runner sol-medium --trials 3
```

A full paid/authenticated matrix is deliberately never run in CI.

## Results

Results are JSON Lines records governed by `result.schema.json`. Task prompts are not duplicated into result records. Raw model stdout/stderr is written under ignored `eval/artifacts/` paths.

Usage fields are nullable. The harness does not invent token counts or dollar costs when the installed Codex surface does not expose measured usage. The summarizer reports usage coverage explicitly.

```bash
npm run eval:summarize -- eval/results/runs.jsonl --format markdown
```

See `docs/evaluation.md` for the study protocol, repeated trials, blind grading, and publication requirements.
