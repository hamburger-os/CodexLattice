# CodexLattice Roadmap

This roadmap separates runtime integration, release hardening, and outcome evaluation so usability or presentation claims never outrun evidence.

## v0.2.x — Foundation and release integrity

Completed foundations include:

- bilingual project entry points and independent visual identity;
- contribution/security/community policies;
- reproducible GitHub Releases and checksums;
- immutable GitHub Actions pins, CodeQL, Scorecard, Dependabot;
- cross-platform package verification;
- explicit Codex compatibility policy;
- package-manifest/runtime version integrity through v0.2.7.

## v0.3.0 — Transparent orchestration + evidence infrastructure

v0.3 combines the previously separate integration and calibration milestones. The runtime goal is that installing CodexLattice once is enough for ordinary Codex CLI/App chats to enter the deterministic router without using a wrapper command.

### Transparent native orchestration implemented

- user-level `UserPromptSubmit` integration for ordinary root turns;
- deterministic `buildPlan()` remains the routing authority before model execution;
- raw user prompt text is not copied into injected developer context;
- root Codex is treated as a coordinator for substantive repository/tool work;
- exact route-specific native roles pin model + reasoning effort;
- root/subagent context guard prevents recursive Lattice routing;
- explicit-null transcript guard avoids routing known internal/non-resumable Desktop turns by default;
- hook failures fail open so Codex remains usable;
- versioned self-contained hook runtime under `CODEX_HOME` avoids App/CLI dependence on npm PATH;
- non-destructive marker-owned `hooks.json` merge;
- schema-v2 receipt and `doctor` integrity for config, roles, hook handler, and runtime;
- adaptive install fails closed if the effective hooks or multi-agent backend cannot support transparent routing;
- legacy `codex-lattice run` retained as an advanced/CI path with explicit hook bypass;
- real-Codex cross-platform smoke covers hook/config/runtime lifecycle;
- desktop compatibility policy now distinguishes implemented shared hook integration from per-App-version UI acceptance.

### Evaluation and evidence infrastructure implemented

- versioned self-contained seed corpus with easy/medium/hard/critical buckets;
- fixed paired runner definitions for adaptive, Sol-medium, Sol-high, and Terra-medium;
- isolated fresh workspaces for every trial;
- protected deterministic evaluator files restored before grading;
- plan-only default so CI cannot accidentally make paid model calls;
- frozen study config with disjoint calibration/holdout tasks;
- reproducible seeded paired execution order;
- machine-readable result schema with nullable measured usage;
- Wilson 95% pass-rate intervals and coverage-aware summaries;
- blind-grading bundle generation with separate de-blinding key;
- validated blind-grade merge workflow;
- holdout-only fail-closed promotion gate;
- sanitized evidence exporter;
- weekly/manual cross-platform `@openai/codex@latest` structural canary.

### Evidence still required before outcome claims

- authenticated repeated trials across the frozen study;
- independent blind human grading;
- trustworthy measured per-run efficiency data at the required coverage;
- a successful holdout promotion decision after calibration is frozen;
- publication of a reviewed, versioned sanitized evidence set;
- a separate policy change citing immutable evidence if calibration justifies changing default thresholds.

Until those artifacts exist, current route-quality values remain heuristics. The project will not publish fixed cost-saving, speedup, quality-preservation, or quality-improvement percentages.

## Compatibility follow-up

The pinned Codex CLI baseline remains the blocking release contract. The latest-Codex canary is an early-warning signal rather than a release guarantee.

For Codex App, the user-level transparent integration path is now implemented. Remaining work is compatibility acceptance rather than inventing a second App-specific router:

- record acceptance against released App/OS combinations;
- follow upstream evolution of hook origin/transcript metadata;
- consume attachment metadata when Codex exposes it to `UserPromptSubmit`;
- keep root/subagent lifecycle assumptions covered by upstream-source review and real smoke tests.

## Later

Potential follow-up work includes larger external benchmark corpora, additional independently graded holdout sets, calibrated task features learned from measured outcomes, richer local route observability, and a documentation site if the documentation surface grows enough to justify it.
