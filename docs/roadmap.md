# CodexLattice Roadmap

This roadmap separates presentation/community work from release hardening and outcome evaluation so cosmetic progress never outruns evidence.

## v0.2.5 — Presentation and community health

Goal: make the project understandable, trustworthy, and contributor-friendly without changing routing semantics.

- bilingual English / Simplified Chinese README;
- independent CodexLattice logo and banner;
- contribution and security policies;
- structured bug / feature / compatibility issue forms;
- pull-request template and CODEOWNERS;
- package metadata for repository/homepage/issues;
- dependency and static-analysis automation.

## v0.2.6 — Release and supply chain

Goal: make releases reproducible and verifiable without making registry publication a prerequisite.

- canonical GitHub Releases with generated notes and checksums;
- packed-tarball verification on Linux, macOS, and Windows;
- isolated install/execute validation before publishing release assets;
- immutable GitHub Actions pins;
- CodeQL and OpenSSF Scorecard;
- supported Codex-version and compatibility policy;
- protected reviewed release-request flow with tag/target verification.

## v0.2.7 — Version integrity

Goal: make the package manifest the single runtime version source and prove that released artifacts report the same version after installation.

- remove stale hard-coded runtime version values;
- assert package/CLI version agreement in real-Codex smoke coverage;
- assert installed tarball/manifest version agreement in release automation;
- publish the repaired v0.2.7 release from the exact reviewed target commit.

## v0.3.0 — Evidence and calibration

Goal: measure whether routing preserves quality while reducing unnecessary reasoning spend, without allowing incomplete evidence to change the default policy.

### Evaluation and evidence infrastructure implemented

- versioned, self-contained seed corpus with easy/medium/hard/critical buckets;
- fixed paired runner definitions for adaptive, Sol-medium, Sol-high, and Terra-medium;
- isolated fresh workspaces for every trial;
- protected deterministic evaluator files restored before grading;
- explicit plan-only default so CI cannot accidentally make paid model calls;
- frozen study config with disjoint calibration/holdout tasks and coverage in every difficulty bucket;
- reproducible seeded paired execution order instead of permanent runner-first ordering;
- machine-readable result schema with nullable usage instead of estimated/fabricated spend;
- pass-rate summaries with Wilson 95% intervals, duration, human-score, and usage coverage;
- blind-grading bundle generation with the de-blinding key kept separate;
- validated blind-grade merge workflow;
- holdout-only, fail-closed promotion gate that blocks quality/critical-task regressions and incomplete measured efficiency evidence;
- sanitized evidence exporter that removes raw artifact paths, route traces, execution-error text, and reviewer notes;
- CI contract that validates corpus, runners, study design, and full study planning without model calls;
- weekly/manual cross-platform `@openai/codex@latest` structural canary;
- explicit Codex App shared-config versus native-UI compatibility boundary and desktop acceptance checklist.

### Evidence still required before v0.3 outcome claims

- authenticated repeated trials across the full frozen study using the configured trial floor or more;
- independent blind human grading of the produced artifacts;
- trustworthy measured per-run efficiency data with the coverage required by the promotion gate;
- a successful holdout promotion decision after calibration is frozen;
- manual inspection and publication of a versioned sanitized evidence set;
- a separate reviewed policy change that cites that immutable evidence if calibration actually justifies changing routing thresholds.

Until those measured artifacts exist, the current routing heuristics remain heuristics. The project will not publish fixed cost-saving, speedup, quality-preservation, or quality-improvement percentages.

## Compatibility follow-up

The pinned Codex CLI baseline remains the blocking release contract. The `Codex latest canary` is an early-warning signal rather than a release guarantee. Codex App shared configuration is an explicit compatibility target, while native desktop UI orchestration is not claimed until the documented desktop acceptance procedure and an upstream-supported integration path are available.

## Later

Potential follow-up work includes larger external benchmark corpora, additional independently graded holdout sets, richer calibrated policy signals, dedicated App integration if upstream exposes an appropriate interface, and a documentation site if the documentation surface grows enough to justify it.
