# CodexLattice Roadmap

This roadmap separates presentation/community work from supply-chain hardening and outcome evaluation so cosmetic progress never outruns evidence.

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

Goal: make releases reproducible and verifiable.

- publish the package through a documented release workflow;
- prefer npm Trusted Publishing / OIDC over long-lived publish tokens;
- publish npm provenance when supported by the release path;
- produce GitHub Releases with generated notes and checksums;
- verify the packed tarball in CI before release;
- evaluate OpenSSF Scorecard findings and fix meaningful gaps;
- document supported Codex versions and compatibility policy.

## v0.3.0 — Evidence and calibration

Goal: measure whether routing preserves quality while reducing unnecessary reasoning spend.

Planned evaluation dimensions:

- task buckets: easy, medium, hard, critical;
- baselines: CodexLattice, Sol-medium single-agent, Sol-high single-agent, Terra-medium single-agent;
- outcome quality and test pass rate;
- human preference / rubric score where deterministic evaluation is insufficient;
- model calls, routing decisions, escalation count, latency, and usage/cost proxies;
- repeated trials where stochasticity matters;
- versioned machine-readable results.

The project should not publish fixed cost-saving or quality-improvement percentages until this evaluation exists and is reproducible.

## Later

Potential follow-up work includes compatibility canaries for newer Codex versions, richer policy signals, additional calibrated presets, and a dedicated documentation site if the documentation surface grows enough to justify it.
