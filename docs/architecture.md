# Architecture

## State machine

`ANALYZE -> PLAN? -> EXPLORE? -> EXECUTE -> VERIFY -> { DONE | REPLAN | ESCALATE }`

The root coordinator may skip PLAN/EXPLORE/VERIFY when the task does not justify them.

## Quality-first selection

For each stage, CodexLattice predicts task-conditioned quality for supported model/effort routes. It finds the best predicted quality `Q*`, retains only routes inside `Q* - delta`, then minimizes nominal cost and latency inside that feasible set. High-risk work uses `delta = 0`.

## Native execution backend

The root execution route is enforced through Codex CLI runtime overrides (`--model` plus `model_reasoning_effort`).

Subagent routing uses route-specific native Codex agent roles instead of relying on dynamic spawn-model overrides. The installer registers a finite role lattice such as:

- `lattice_plan_terra_medium`
- `lattice_plan_sol_high`
- `lattice_explore_luna_low`
- `lattice_execute_terra_medium`
- `lattice_verify_sol_max`

Each role config pins exactly one model and reasoning effort and carries stage-specific developer instructions. The orchestrator sends the selected agent type to Codex. This design remains deterministic even when a Codex multi-agent tool variant does not expose model/reasoning fields on `spawn_agent`.

## Installation integrity

Installation is transactional and fail-closed:

`PROBE CODEX -> SNAPSHOT -> WRITE ROLES -> WRITE CONFIG -> NATIVE PARSE -> RECEIPT`

Any post-write structural validation failure triggers rollback. Runtime preflight checks the receipt and hashes before starting a task.

## Parallelism

Parallelism is a routing/prompt constraint, not a blanket global concurrency rewrite:

- exploration <= 3 only for independent questions;
- implementation <= 2 only for independent write workstreams;
- serial dependencies remain serial.

This avoids assuming that one global `[agents]` concurrency field has identical semantics across current and future Codex multi-agent backends.

## Verification

Deterministic tests, type checks, static analysis, reproducible commands, and direct evidence are preferred over model voting. Sol/high/xhigh/max review is reserved for cases where risk or evidence justifies it.

## Calibration path

The seed router is transparent rather than learned. v0.3 is intended to calibrate `P(success | task, model, effort, stage, context)` using paired evaluations while preserving the lexicographic quality-floor objective.
