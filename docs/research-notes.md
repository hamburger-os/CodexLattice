# Prior art and design boundary

CodexLattice borrows methods, not branding or code, from several lines of work:

- RouteLLM: preference-trained strong/weak model routing and evaluation discipline.
- FrugalGPT: cascade only when escalation is justified.
- Mixture-of-Agents and self-consistency: conditional ensembles can improve quality, but should not be default fan-out.
- Coding-agent routers such as Autohand Routes and agent-router: explicit policy, observability, hard constraints, and model/specialist separation.
- Codex native subagents: role-scoped model and reasoning-effort configuration makes heterogeneous orchestration possible without rebuilding the coding runtime.

CodexLattice's intended niche is lifecycle orchestration specifically for Codex GPT-5.6: stage-aware planning/exploration/execution/verification, quality-ceiling-first routing, evidence-triggered escalation, bounded parallelism, reversible Codex configuration, transparent ordinary-chat integration, and a reliable single-mode escape hatch.

## Evidence boundary

The repository now includes the mechanics needed to run a reproducible paired study: a versioned corpus, frozen calibration/holdout split, fixed study seeds, deterministic paired ordering, blind-grade identifiers, result validation, Wilson confidence intervals, sanitized evidence export, and a holdout-only fail-closed promotion gate. Full-study execution refuses to append to an existing result set, and promotion rejects duplicate/unpaired trials, stale corpus or runner versions, protected-evaluator changes, timeouts, and candidate/baseline environment mismatches.

Those controls make an experiment auditable; they do **not** themselves prove that adaptive routing improves quality, cost, or latency. Such claims require repeated authenticated trials, measured usage, blind grading where required, and publication of the resulting evidence artifact. Calibration work must use the calibration split; final promotion decisions must remain holdout-only.

## Codex App boundary

Starting with v0.3, CodexLattice has an implemented shared integration path for Codex CLI and Codex App surfaces that load the same user-level Codex configuration and lifecycle-hook layer. Adaptive installation places route-specific native roles, one `UserPromptSubmit` handler, and a self-contained runtime under the user's `CODEX_HOME`; the desktop UI does not need a second CodexLattice-specific router or wrapper command.

That implemented shared path is still distinct from claiming that every released Codex App build has been acceptance-tested. App-specific background/internal turns, hook review UX, attachment metadata, and future lifecycle changes remain version-specific compatibility concerns. The repository therefore keeps a manual desktop acceptance checklist in [`codex-app.md`](codex-app.md), while automated compatibility tests exercise the supported CLI/config/hook contract across Linux, macOS, and Windows.

Claims about desktop behavior should distinguish:

- **implemented integration:** ordinary root prompts can enter the same user-level hook/config path without `codex-lattice run`;
- **blocking structural evidence:** pinned real-Codex CLI smoke proves the generated config, hook command, runtime integrity probe, mode lifecycle, and uninstall behavior;
- **per-App acceptance:** a particular desktop version/OS has been manually shown to load the same profile and satisfy the documented checklist.

Do not infer the third level from the first two.
