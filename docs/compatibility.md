# Codex compatibility policy

CodexLattice v0.3 depends on both native Codex multi-agent behavior and the user lifecycle-hook surface. Compatibility is therefore a release boundary, not an assumption.

## Current baseline

- minimum accepted Codex CLI: `0.149.0`;
- blocking CI-tested Codex CLI baseline: `0.149.1`;
- tested operating systems: GitHub-hosted Ubuntu, macOS, and Windows;
- supported Node.js runtime: `>=20`, with CI coverage on Node 20/22 and package verification on Node 24.

On the pinned 0.149.1 baseline, Codex reports `multi_agent` and `hooks` as stable features. Adaptive install additionally validates the effective feature state in the target `CODEX_HOME`.

A newer Codex CLI can be accepted when the structural/runtime probes succeed, but that is not equivalent to full regression coverage for every upstream release.

## Blocking compatibility contract

The real-Codex smoke matrix installs the pinned Codex baseline and CodexLattice globally, creates a temporary `CODEX_HOME`, and verifies without authenticated/paid model calls that:

- Codex accepts the generated route-specific agent configuration;
- an effective native multi-agent backend is enabled;
- the hooks backend is enabled when the transparent Lattice handler is installed;
- `hooks.json` contains exactly one marker-owned Lattice `UserPromptSubmit` handler;
- the self-contained hook runtime exists and matches its receipt;
- GPT-5.6 Luna/Terra/Sol route slugs are visible in the local bundled catalog;
- `doctor --strict` succeeds;
- `adaptive -> single -> adaptive` is reversible;
- uninstall restores the baseline and removes only CodexLattice-owned assets.

Unit CI additionally executes the copied hook runtime directly on all supported Node/OS matrices, so the runtime must be loadable independently of the source checkout/global package.

A change that breaks the pinned Linux, macOS, or Windows contract cannot satisfy the required CI gate.

## Hooks compatibility rules

Transparent adaptive mode requires `UserPromptSubmit` command hooks with additional developer context. Compatibility-sensitive changes therefore include:

- lifecycle event names or stdin schema;
- root versus subagent context fields;
- hook command configuration fields or shell semantics;
- additional-context output schema/role semantics;
- hook feature naming/default state;
- hook discovery/trust behavior;
- transcript/origin metadata used to distinguish resumable user turns from internal work.

If a Codex build reports `hooks=false` while the CodexLattice transparent handler is installed, installation/doctor fails closed. A user must not receive an “adaptive installed” state when ordinary prompts cannot actually enter the router.

Codex hook trust remains outside the installer compatibility proof: the installer never mutates Codex's trusted-hook state.

## Multi-agent compatibility rules

Compatibility-sensitive changes also include:

- multi-agent feature flags/backend names;
- agent role TOML parsing;
- agent-type registration;
- child-agent role/model/reasoning semantics;
- bounded delegation/tool behavior;
- bundled GPT-5.6 model slugs.

Route-specific role files intentionally avoid depending on dynamic model/reasoning arguments being present on every `spawn_agent` implementation.

## Explicit-run compatibility

`codex-lattice run` remains an advanced/CI path and still depends on `codex exec --model` plus config overrides. The child is launched with `CODEX_LATTICE_BYPASS_HOOK=1` so the installed transparent hook cannot double-route it.

This explicit path is validated separately from ordinary-chat transparent routing.

## Newer Codex canary

`.github/workflows/codex-canary.yml` runs weekly and on manual dispatch with `@openai/codex@latest` on Ubuntu, macOS, and Windows. It exercises the structural installation lifecycle without model calls.

The canary is an early-warning signal, not a release guarantee. A passing canary does not prove account entitlement, paid-model execution, or every upstream behavior outside the smoke contract.

## Codex App boundary

v0.3 has an upstream-supported desktop integration path: the same user-level hook/config layer can route ordinary root prompts without requiring the App UI to invoke `codex-lattice run`.

The integration path is implemented, while App-release acceptance remains version-specific. CI cannot drive every desktop build, and current upstream limitations include internal non-resumable turns and lack of image attachment contents in the `UserPromptSubmit` classifier payload.

See [`codex-app.md`](codex-app.md) for the exact desktop acceptance checklist and claim levels.

## Reporting

Compatibility reports should include OS, Node version, Codex CLI/runtime version, CodexLattice version, install/upgrade path, and sanitized `doctor --strict` output. App reports should additionally include App version and whether the issue concerns hook discovery/trust, ordinary-turn execution, subagent recursion, or an App-specific background/UI flow.

Do not include credentials, private prompts, or unrelated private configuration.
