# Changelog

Notable project changes are documented here. CodexLattice follows semantic versioning where practical while the project is pre-1.0.

## Unreleased

### Added

- bilingual English / Simplified Chinese project entry points;
- CodexLattice visual identity assets and README banner;
- contribution, security, code-of-conduct, issue, and pull-request guidance;
- roadmap for release hardening and paired evaluation;
- package repository/homepage/bug metadata;
- Dependabot and CodeQL configuration;
- stable `required / ci` branch-protection gate and npm package-manifest verification;
- npm Trusted Publishing/OIDC release workflow with integrity-aware reruns, checksums, and GitHub Release assets;
- OpenSSF Scorecard workflow with SARIF upload to GitHub code scanning;
- release-process and Codex compatibility documentation.

### Changed

- README reorganized around quick start, native-role architecture, integrity guarantees, and explicit evidence boundaries;
- GitHub Actions dependencies used by CI/security workflows are pinned to immutable commit SHAs.

## 0.2.4

### Fixed

- recognize the effective Codex multi-agent backend when stable `multi_agent` is enabled even if `multi_agent_v2` is disabled;
- require revalidation after the installed Codex CLI version changes;
- harden global npm installation smoke coverage across Linux, macOS, and Windows.

### Security and reliability

- fail closed when no recognized multi-agent backend is enabled;
- preserve installation rollback and managed configuration integrity checks;
- keep route roles pinned to native Codex model/reasoning configuration.
