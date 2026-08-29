# Architecture

CodexLattice is a thin policy layer over Codex native subagents. It does not replace Codex, proxy model traffic, or change sandbox/approval policy.

## State machine

`ANALYZE -> PLAN? -> EXPLORE? -> EXECUTE -> VERIFY -> {DONE | REPLAN | ESCALATE}`

The root agent can skip stages when the task is simple. Parallelism is allowed only for independent workstreams.

## Quality-first route selection

For each stage, the policy builds a bounded candidate set of `(model, reasoning effort)` routes.

1. Apply stage/risk hard constraints.
2. Estimate task-conditioned quality for each candidate.
3. Compute the predicted ceiling `Q*`.
4. Keep only candidates within `delta` of `Q*`.
5. Choose the lowest nominal-cost candidate, then lowest latency, inside that near-optimal set.
6. Set `delta = 0` for high-risk work.

This is intentionally lexicographic. A cheap route cannot compensate for a material predicted quality loss.

## Model/effort envelope

- Exploration: Luna low/medium, Terra medium.
- Execution: Luna medium through Sol high.
- Planning/verification: Terra high through Sol xhigh.
- `max` reasoning is exposed only for tasks classified as critical and only in planning/verification.

`max` being available does not mean it is automatically chosen. If the seed quality model predicts no gain over `xhigh`, the cheaper route wins. This is deliberate until eval data proves otherwise.

## Cost signal

The seed policy derives a nominal ranking index from a pinned public GPT-5.6 input/output price snapshot plus an explicit effort multiplier. The index is only used to order routes after the quality floor is satisfied. It is not an estimate of an actual invoice because real token/reasoning usage is task-dependent.

## Explainability

`codex-lattice explain --trace` returns every stage candidate with:

- predicted quality,
- quality gap from `Q*`,
- near-optimal eligibility,
- rejection reason,
- nominal cost and latency rank,
- final selection reason.

This makes routing debuggable and gives calibration work a stable trace format.

## Telemetry and calibration

Telemetry is disabled by default. When enabled it writes local JSONL under `CODEX_HOME` and never writes raw task text. A task is represented by a short SHA-256 fingerprint and length.

Recorded execution signals include selected routes, task features, exit code, and elapsed time. Optional user feedback (`pass`, `mixed`, `fail`) is stored as a separate event because process exit status is not a reliable quality label.

Long term, the transparent seed model should be replaced by calibrated estimates of:

`P(success | task, model, effort, stage, context)`

alongside expected spend, latency and regression risk.

## Configuration safety

The installer owns only the text between its managed markers and its four agent TOML files. `single` mode removes the managed block rather than forcing a model. If an unmanaged `[agents]` or `[agents.*]` table exists, adaptive installation refuses to proceed instead of risking duplicate TOML tables.
