# Changelog

Notable project changes are documented here. CodexLattice follows semantic versioning where practical while the project is pre-1.0.

## Unreleased

### Added

- versioned paired-evaluation seed corpus with two deterministic tasks in each easy/medium/hard/critical bucket;
- safe plan-only-by-default evaluation runner for adaptive, Sol-medium, Sol-high, and Terra-medium baselines;
- protected evaluator-file restoration so benchmark runners cannot pass by weakening tests;
- machine-readable result schema, ignored raw artifact storage, and coverage-aware result summarization;
- frozen calibration/holdout study contract with a reproducible seeded paired execution order;
- Wilson 95% pass-rate intervals for evaluation summaries;
- blind-grading bundle generation with a separately stored de-blinding key and validated grade merge workflow;
- holdout-only fail-closed promotion gate that blocks incomplete evidence, quality regression, critical paired regression, and insufficient measured efficiency improvement;
- sanitized public-evidence exporter that omits raw artifact paths, execution-error text, route traces, and reviewer notes;
- CI evaluation contract that validates corpus, runner, study, and full seeded planning without authenticated or paid model calls;
- weekly/manual cross-platform `@openai/codex@latest` structural compatibility canary.

### Documentation

- expanded evaluation protocol for frozen study design, repeated paired trials, blind grading, uncertainty, usage coverage, promotion gating, calibration/holdout separation, and sanitized evidence publication;
- documented the Codex App support boundary: shared Codex configuration compatibility is a target, while native App UI orchestration is not claimed without desktop verification;
- synchronized English/Chinese README, compatibility policy, and roadmap with the implemented evidence controls and remaining external evidence work.

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
