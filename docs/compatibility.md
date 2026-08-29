# Codex compatibility policy

CodexLattice depends on native Codex multi-agent behavior and therefore treats compatibility as an explicit release boundary. CLI support, newer-version canary coverage, shared Codex configuration compatibility, and Codex App UI integration are intentionally reported as separate evidence levels.

## Current baseline

- minimum accepted Codex CLI: `0.149.0`;
- blocking CI-tested Codex CLI baseline: `0.149.1`;
- tested operating systems: GitHub-hosted Ubuntu, macOS, and Windows;
- supported Node.js runtime: `>=20`, with CI coverage on Node 20 and 22 and package verification on Node 24.

The installer may accept a newer Codex CLI when its structural/runtime validation succeeds. That acceptance is not the same as claiming full regression coverage for every newer Codex release.

## What blocking CI proves

The real-Codex smoke job installs the pinned Codex baseline, installs CodexLattice globally, creates a temporary `CODEX_HOME`, validates the managed configuration and native agent roles, exercises mode transitions, and verifies uninstall/restore behavior without making authenticated or paid model calls.

This matrix is the release compatibility floor. A change that breaks the pinned Linux, macOS, or Windows smoke cannot satisfy `required / ci`.

## Newer Codex canary

`.github/workflows/codex-canary.yml` runs weekly and on manual dispatch. It installs `@openai/codex@latest` on Ubuntu, macOS, and Windows and executes the same structural install/doctor/mode/uninstall smoke without model calls.

The canary is an early-warning signal, not a release guarantee. A successful canary means the latest published CLI still satisfies the structural contract exercised by the smoke test at that point in time. It does not prove account entitlement, authenticated model execution, or every upstream behavior outside that contract.

## Codex App boundary

CodexLattice-managed native roles and configuration are designed to coexist with Codex surfaces that consume the same Codex configuration. The project therefore treats **Codex App shared-configuration compatibility** as a target.

That does not mean an arbitrary task started from the desktop UI is proven to invoke `codex-lattice run`. Native App UI orchestration is not claimed until an upstream-supported integration path and desktop acceptance evidence exist.

See [`codex-app.md`](codex-app.md) for the exact support levels and the desktop acceptance checklist.

## Compatibility changes

A Codex update should be treated as compatibility-sensitive when it changes any of these surfaces:

- multi-agent feature flags or backend naming;
- agent role TOML parsing;
- child-agent model/reasoning override behavior;
- `codex exec` options used by CodexLattice;
- bundled GPT-5.6 model slugs;
- configuration paths or validation commands;
- App-side configuration migration or lifecycle behavior that can rewrite the shared Codex configuration.

Before changing the pinned blocking baseline, run the full cross-platform test matrix and update this document when the minimum or tested version changes. A passing `latest` canary alone is not sufficient reason to silently move the release baseline.

## Reporting

Use the repository's **Codex compatibility report** issue form and include the OS, Codex CLI version, CodexLattice version, install/upgrade path, and sanitized `doctor --strict` output. For Codex App reports, also include the App version and state whether the finding concerns shared configuration or an App-specific UI/runtime flow.

Do not include credentials, private prompts, absolute private paths, or unrelated user configuration.
