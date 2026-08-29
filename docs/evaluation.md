# Evaluation and calibration

CodexLattice is quality-first. It should not claim cost savings until the adaptive policy is compared against strong fixed baselines on the same tasks.

## Recommended paired matrix

Run the same task set under:

- A: GPT-5.6 Sol, medium, single-agent
- B: GPT-5.6 Sol, high, single-agent
- C: GPT-5.6 Terra, medium, single-agent
- D: CodexLattice adaptive
- E: CodexLattice adaptive with eligible parallel exploration/workstreams
- F: quality-ceiling configuration for the hardest tasks

Use deterministic task checks whenever possible: tests, type checks, static analysis, reproducible commands, or domain-specific graders. Human or model grading should be secondary and blinded to route identity when feasible.

## Telemetry

Telemetry is **off by default**, local-only, and does not store raw task text. Enable it explicitly:

```bash
codex-lattice telemetry on
codex-lattice telemetry status
```

Each run records a task hash/length, task features, selected execute/verify routes, exit code and elapsed time. After a run, users can optionally attach a quality label:

```bash
codex-lattice feedback <run-id> pass
codex-lattice feedback <run-id> fail "regression in auth flow"
```

Summarize local telemetry:

```bash
codex-lattice telemetry summarize
```

Exit code is not treated as a quality label. A successful command can still produce a poor patch; a failed command can still surface useful evidence.

## Calibration target

The long-term router should estimate:

`P(success | task, model, effort, stage, context)`

plus expected spend, latency and regression risk. The quality-first selection policy then keeps routes inside a calibrated near-optimal quality set and minimizes spend/latency only inside that set.

## Shadow mode

`codex-lattice shadow <task>` shows the adaptive route beside a fixed Sol-medium single-agent reference **without executing either route**. It is for inspection and dataset design, not performance claims.
