# CodexLattice

**Quality-first, cost-efficient orchestration for Codex using GPT-5.6 Sol / Terra / Luna.**

CodexLattice is a Codex-native reasoning-resource scheduler. It tries to preserve the best attainable result, then spend as little as possible *without leaving the near-optimal quality region*.

> v0.2 adds explainable route traces, critical-task `max` reasoning eligibility, opt-in local telemetry, feedback labels, and shadow routing for calibration. The router is still a transparent seed policy, not a statistically calibrated predictor yet.

## Why

Static recipes such as “Sol plans, Terra codes, Sol reviews” waste expensive calls on easy work and can still under-spend on genuinely risky work. CodexLattice uses a stage-aware policy:

- **Plan**: Terra for ordinary work; Sol when ambiguity/risk/architecture requires it.
- **Explore**: Luna, parallel only across independent repository questions.
- **Execute**: Terra/Luna when predicted quality remains near the ceiling; escalate only on evidence.
- **Verify**: deterministic checks first; Sol reviewer for high-risk, disagreement, or incomplete validation.
- **Critical ceiling**: `max` reasoning is eligible only for critical planning/verification paths.
- **Fallback**: `single` mode removes CodexLattice's managed orchestration block and returns control to the user's original Codex configuration.

## Objective

For candidate routes `r`:

1. Estimate task-conditioned quality `Q(r | task, stage)`.
2. Find the predicted quality ceiling `Q*`.
3. Keep routes with `Q(r) >= Q* - δ`.
4. Among those routes, minimize nominal cost, then latency.
5. For high-risk work, set `δ = 0`.

This is lexicographic optimization: quality is not traded away by a cost weight.

The current quality model is intentionally simple and inspectable. `cost` is a ranking index based on a public GPT-5.6 pricing snapshot plus a heuristic effort factor; it is **not** a bill estimator.

## Install

```bash
npm install -g .
codex-lattice install adaptive
codex-lattice doctor
```

The installer backs up `~/.codex/config.toml`, adds a clearly delimited managed block, and installs four native Codex subagents. It does **not** alter sandbox or approval settings. If an unmanaged `[agents]` or `[agents.*]` table already exists, it refuses to overwrite or duplicate it.

## Use

Inspect a route:

```bash
codex-lattice explain "refactor authentication across three modules"
```

Inspect the complete candidate set and rejection reasons:

```bash
codex-lattice explain --trace "refactor authentication across three modules"
```

Counterfactual shadow view against a Sol-medium single-agent reference:

```bash
codex-lattice shadow "refactor authentication across three modules"
```

Run through Codex:

```bash
codex-lattice run "refactor authentication across three modules"
```

Switch off orchestration without replacing the user's original model settings:

```bash
codex-lattice mode single
```

Re-enable:

```bash
codex-lattice mode adaptive
```

## Local telemetry (opt-in)

Telemetry is disabled by default and stays local. Raw task text is never written by CodexLattice telemetry.

```bash
codex-lattice telemetry on
codex-lattice telemetry status
codex-lattice telemetry summarize
```

When telemetry is on, `run` prints a run id. Optionally attach a quality label:

```bash
codex-lattice feedback <run-id> pass
codex-lattice feedback <run-id> mixed "tests pass but implementation is too invasive"
```

See [`docs/evaluation.md`](docs/evaluation.md) for the paired benchmark and calibration protocol.

## Roles

| Role | Default model | Effort | Purpose |
|---|---|---|---|
| planner | GPT-5.6 Sol | high | architecture, ambiguity, decomposition, stop conditions |
| explorer | GPT-5.6 Luna | low | bounded repository search/evidence |
| implementer | GPT-5.6 Terra | medium | normal coding work |
| reviewer | GPT-5.6 Sol | high | independent high-rigor verification |

The root policy is **not** required to use every role. Simple tasks should remain simple, and parallelism is bounded.

## Safety and configuration behavior

- Does not change Codex sandbox or approval settings.
- Refuses unmanaged `[agents]` / `[agents.*]` conflicts rather than generating invalid TOML.
- `single` mode is passthrough: it removes only the managed block and preserves the user baseline.
- Telemetry is explicit opt-in, local-only, and task-text-free by default.

## What v0.2 intentionally does not claim

- No claim that heuristic quality values are calibrated probabilities.
- No claim that multiple cheaper agents equal one stronger model.
- No claim of a fixed percentage cost saving or speedup.
- No automatic online learning from user traffic.

The next milestone is a reproducible task → route → outcome dataset and paired benchmarks against strong single-agent baselines.

## Prior art

See [`docs/research-notes.md`](docs/research-notes.md). CodexLattice is narrower than generic LLM routers: it is a Codex-native lifecycle orchestration and reasoning-resource policy, not a provider gateway.

## License

Apache-2.0.
