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

- publish canonical GitHub Releases with generated notes and checksums;
- verify the packed tarball in CI before release on Linux, macOS, and Windows;
- install and execute the packed tarball before publishing release assets;
- pin GitHub Actions dependencies to immutable commits;
- run CodeQL and OpenSSF Scorecard;
- document supported Codex versions and compatibility policy;
- defer npm registry publishing until it provides enough distribution value to justify account-side setup.

## v0.3.0 — Evidence and calibration

Goal: measure whether routing preserves quality while reducing unnecessary reasoning spend.

### Evaluation infrastructure implemented

- versioned, self-contained seed corpus with easy/medium/hard/critical buckets;
- fixed paired runner definitions for adaptive, Sol-medium, Sol-high, and Terra-medium;
- isolated fresh workspaces for every trial;
- protected deterministic evaluator files restored before grading;
- explicit plan-only default so CI cannot accidentally make paid model calls;
- machine-readable result schema with nullable usage instead of estimated/fabricated spend;
- result summarizer with pass-rate, duration, human-score, and usage-coverage reporting;
- CI contract that validates corpus integrity and execution planning without model calls.

### Evidence still required before v0.3 claims

- authenticated repeated trials across the full corpus;
- randomized paired execution order;
- blind human grading where deterministic tests are insufficient;
- versioned sanitized result publication;
- calibration/holdout split before tuning route thresholds;
- holdout comparison against stronger baselines after calibration;
- explicit reporting of missing data and usage coverage.

The project will not publish fixed cost-saving, speedup, or quality-improvement percentages until this measured evaluation exists and is reproducible.

## Later

Potential follow-up work includes optional npm Trusted Publishing, compatibility canaries for newer Codex versions, richer policy signals, additional calibrated presets, and a dedicated documentation site if the documentation surface grows enough to justify it.
