# Changelog

Notable project changes are documented here. CodexLattice follows semantic versioning where practical while the project is pre-1.0.

## Unreleased

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
