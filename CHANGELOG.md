# Changelog

Notable project changes are documented here. CodexLattice follows semantic versioning where practical while the project is pre-1.0.

## Unreleased

### Added

- bilingual English / Simplified Chinese project entry points;
- CodexLattice visual identity assets and README banner;
- contribution, security, code-of-conduct, issue, and pull-request guidance;
- roadmap for release hardening and paired evaluation;
- package repository/homepage/bug metadata;
- Dependabot and CodeQL configuration.

### Changed

- README reorganized around quick start, native-role architecture, integrity guarantees, and explicit evidence boundaries.

## 0.2.4

### Fixed

- recognize the effective Codex multi-agent backend when stable `multi_agent` is enabled even if `multi_agent_v2` is disabled;
- require revalidation after the installed Codex CLI version changes;
- harden global npm installation smoke coverage across Linux, macOS, and Windows.

### Security and reliability

- fail closed when no recognized multi-agent backend is enabled;
- preserve installation rollback and managed configuration integrity checks;
- keep route roles pinned to native Codex model/reasoning configuration.
