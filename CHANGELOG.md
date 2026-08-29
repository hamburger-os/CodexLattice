# Changelog

Notable project changes are documented here. CodexLattice follows semantic versioning where practical while the project is pre-1.0.

## Unreleased

## 0.3.0

### Transparent orchestration

- route ordinary Codex root prompts through a user-level `UserPromptSubmit` hook so adaptive mode no longer requires `codex-lattice run` for normal CLI/App chats;
- keep the deterministic JavaScript `buildPlan()` policy as the routing authority before model execution;
- inject only derived route metadata and coordinator rules, never a copy of the raw user prompt, into developer context;
- treat the root Codex process as a coordinator for substantive repository/tool work and delegate to exact route-specific native roles;
- ignore subagent prompt hooks to prevent recursive Lattice orchestration;
- fail open on hook/runtime errors and skip explicit-null-transcript internal/non-resumable turns by default;
- retain `codex-lattice run` as an advanced/CI path and mark its child process to bypass transparent re-entry.

### Installation and compatibility

- add a versioned self-contained hook runtime under `CODEX_HOME/codex-lattice/runtime/<version>` with pinned Node launchers for Unix and Windows;
- merge exactly one marker-owned Lattice handler into `hooks.json` while preserving unrelated user hooks;
- extend the installation receipt to schema v2 with hook/runtime integrity metadata;
- extend `doctor --strict` to validate the managed hook, runtime hashes, hooks feature, multi-agent backend, and existing config/role integrity;
- fail adaptive installation when Codex reports the effective hooks backend disabled while the transparent handler is installed;
- preserve transactional rollback across config, roles, hooks, runtime, and receipt;
- extend the real-Codex 0.149.1 smoke matrix to validate transparent routing assets across Ubuntu, macOS, and Windows;
- execute the copied self-contained hook runtime in unit CI rather than only checking that its files exist;
- update package verification to require the new transparent-runtime source modules.

### Evaluation and evidence

- add a versioned paired-evaluation seed corpus with deterministic easy/medium/hard/critical tasks;
- add safe plan-only-by-default evaluation runners for adaptive, Sol-medium, Sol-high, and Terra-medium baselines;
- protect evaluator files so benchmark runners cannot pass by weakening tests;
- add machine-readable results, coverage-aware summaries, and Wilson 95% pass-rate intervals;
- freeze calibration/holdout study design with reproducible seeded paired execution order;
- add blind-grading bundle generation, separate de-blinding key, and validated grade merge workflow;
- add a holdout-only fail-closed promotion gate for incomplete evidence, quality regression, critical paired regression, and insufficient measured efficiency improvement;
- add sanitized public-evidence export and a CI evaluation contract that makes no authenticated/paid model calls;
- add weekly/manual cross-platform `@openai/codex@latest` structural compatibility canary.

### Security and reliability

- keep user content in the user role instead of elevating task text through hook context;
- refuse malformed or ambiguous `hooks.json` states instead of overwriting them;
- preserve unrelated hooks through adaptive/single/uninstall lifecycle operations;
- full-study execution refuses to append to an existing result set or reuse an existing study manifest;
- blind grading refuses to overwrite an existing de-blinding key, and grade application rejects duplicate blind IDs, ambiguous key mappings, duplicate raw run IDs, and mappings to unknown runs;
- promotion requires current corpus/runner versions, duplicate-free paired trials, and matching candidate/baseline execution environments;
- public evidence export rejects mixed or stale corpus/runner versions.

### Documentation

- make “install once, then chat normally in Codex” the primary English/Chinese quick-start path;
- document the one-time Codex hook review boundary rather than bypassing hook trust state;
- document implemented Codex App shared hook/config integration separately from per-App-version UI acceptance;
- document current upstream limitations for internal non-resumable Desktop turns and image attachment classification;
- synchronize architecture, installation, compatibility, roadmap, and App-support documentation with the transparent runtime.

## 0.2.7

### Fixed

- derive the running CodexLattice version from `package.json` instead of a stale hard-coded constant;
- require real-Codex smoke tests to assert CLI and installation-receipt versions match the package manifest;
- require release tarball verification to fail when the globally installed CLI reports a version different from the tagged package manifest.

### Release integrity

- keep the existing v0.2.6 tag and release immutable; version-integrity corrections are shipped only through the new v0.2.7 patch release.

## 0.2.6

### Added

- bilingual English / Simplified Chinese project entry points and independent visual identity;
- contribution, security, code-of-conduct, issue, pull-request, CODEOWNERS, and roadmap files;
- Dependabot, CodeQL, and OpenSSF Scorecard automation;
- stable `required / ci` branch-protection gate;
- reproducible GitHub Release workflow with generated notes, installable tarball, and SHA256 checksums;
- package-manifest verification and Codex compatibility/release documentation.

### Changed

- GitHub Actions dependencies used by CI/security workflows are pinned to immutable commit SHAs;
- package verification runs on Linux, macOS, and Windows with Node 24;
- GitHub Releases are the canonical distribution channel; npm registry publication is deferred and no longer blocks releases.

### Fixed

- package verification now invokes npm through Node's `npm_execpath`, avoiding Windows `spawnSync npm.cmd EINVAL` failures on modern Node releases;
- npm-normalized CLI `bin` metadata no longer triggers publish-time package correction warnings.

## 0.2.4

### Fixed

- recognize the effective Codex multi-agent backend when stable `multi_agent` is enabled even if `multi_agent_v2` is disabled;
- require revalidation after the installed Codex CLI version changes;
- harden global npm installation smoke coverage across Linux, macOS, and Windows.

### Security and reliability

- fail closed when no recognized multi-agent backend is enabled;
- preserve installation rollback and managed configuration integrity checks;
- keep route roles pinned to native Codex model/reasoning configuration.
