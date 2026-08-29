# Codex compatibility policy

CodexLattice depends on native Codex multi-agent behavior and therefore treats CLI compatibility as an explicit release boundary.

## Current baseline

- minimum accepted Codex CLI: `0.149.0`;
- CI-tested Codex CLI baseline: `0.149.1`;
- tested operating systems: GitHub-hosted Ubuntu, macOS, and Windows;
- supported Node.js runtime: `>=20`, with CI coverage on Node 20 and 22 and package verification on Node 24.

The installer may accept a newer Codex CLI when its structural/runtime validation succeeds. That acceptance is not the same as claiming full regression coverage for every newer Codex release.

## What CI proves

The real-Codex smoke job installs the pinned Codex baseline, installs CodexLattice globally, creates a temporary `CODEX_HOME`, validates the managed configuration and native agent roles, exercises mode transitions, and verifies uninstall/restore behavior without making authenticated or paid model calls.

## Compatibility changes

A Codex update should be treated as compatibility-sensitive when it changes any of these surfaces:

- multi-agent feature flags or backend naming;
- agent role TOML parsing;
- child-agent model/reasoning override behavior;
- `codex exec` options used by CodexLattice;
- bundled GPT-5.6 model slugs;
- configuration paths or validation commands.

Before changing the pinned CI baseline, run the full cross-platform test matrix and update this document when the minimum or tested version changes.

## Reporting

Use the repository's **Codex compatibility report** issue form and include the OS, Codex version, CodexLattice version, install/upgrade path, and sanitized `doctor --strict` output. Do not include credentials, private prompts, or unrelated user configuration.
