# Prior art and design boundary

CodexLattice borrows methods, not branding or code, from several lines of work:

- RouteLLM: preference-trained strong/weak model routing and evaluation discipline.
- FrugalGPT: cascade only when escalation is justified.
- Mixture-of-Agents and self-consistency: conditional ensembles can improve quality, but should not be default fan-out.
- Coding-agent routers such as Autohand Routes and agent-router: explicit policy, observability, hard constraints, and model/specialist separation.
- Codex native subagents: role-scoped model and reasoning-effort configuration makes heterogeneous orchestration possible without rebuilding the coding runtime.

CodexLattice's intended niche is lifecycle orchestration specifically for Codex GPT-5.6: stage-aware planning/exploration/execution/verification, quality-ceiling-first routing, evidence-triggered escalation, bounded parallelism, reversible Codex configuration, and a single-mode escape hatch.

## Evidence boundary

The repository now includes the mechanics needed to run a reproducible paired study: a versioned corpus, frozen calibration/holdout split, fixed study seeds, deterministic paired ordering, blind-grade identifiers, result validation, Wilson confidence intervals, sanitized evidence export, and a holdout-only fail-closed promotion gate. Full-study execution refuses to append to an existing result set, and promotion rejects duplicate/unpaired trials, stale corpus or runner versions, protected-evaluator changes, timeouts, and candidate/baseline environment mismatches.

Those controls make an experiment auditable; they do **not** themselves prove that adaptive routing improves quality, cost, or latency. Such claims require repeated authenticated trials, measured usage, blind grading where required, and publication of the resulting evidence artifact. Calibration work must use the calibration split; final promotion decisions must remain holdout-only.

## Codex App boundary

CodexLattice is implemented against Codex CLI configuration and native agent-role behavior. Codex App / desktop compatibility is therefore treated as a separate integration surface rather than inferred from CLI success. The repository documents a manual desktop acceptance checklist in [`codex-app.md`](codex-app.md), while automated compatibility canaries exercise supported CLI behavior across Linux, macOS, and Windows. App-specific claims should only be made after the App is shown to use the same effective Codex configuration and the documented acceptance checks pass.
