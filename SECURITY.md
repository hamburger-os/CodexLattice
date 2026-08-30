# Security Policy

CodexLattice modifies local Codex configuration and installs a persistent user-level lifecycle hook, so installation integrity, hook trust, and configuration ownership are security-relevant behavior.

## Supported versions

Security fixes are provided for the latest released CodexLattice version. Older versions may be asked to upgrade before a report is investigated.

## Reporting a vulnerability

Please do **not** publish exploit details, tokens, credentials, private prompts, proprietary source code, or sensitive local Codex configuration in a normal GitHub issue.

Preferred reporting path:

1. Use GitHub's **Report a vulnerability** / private security advisory flow for this repository when available.
2. If that flow is unavailable, open a public issue titled `[SECURITY] Request private contact` containing only a high-level description and no exploit details. A private channel can then be established.

Useful information includes the affected CodexLattice version, Codex version, operating system, impact, reproduction conditions, installation/upgrade path, and whether the issue requires a malicious repository/task/configuration or write access to the user's `CODEX_HOME`.

## Managed security surface

Adaptive installation manages only CodexLattice-owned state:

- a clearly delimited agent-registration block in `config.toml`;
- route-specific `codex-lattice-*.toml` role files under `CODEX_HOME/agents`;
- one marker-owned `UserPromptSubmit` command handler merged into `hooks.json`;
- a versioned self-contained routing runtime under `CODEX_HOME/codex-lattice/runtime/<version>/`;
- an installation receipt under `CODEX_HOME/codex-lattice/install.json`.

Unrelated user configuration, roles, and hooks must be preserved. Runtime or role files are removed only when installation ownership can be established; modified superseded runtime files are preserved rather than deleted speculatively.

## Hook trust and runtime integrity

Codex owns user-hook review/trust. CodexLattice installs a user hook but does not write Codex trust state, trusted hashes, or approval settings.

Starting with v0.3.1, the reviewed hook command contains:

- the pinned Node executable used for the installation;
- a small inline bootstrap;
- the path and SHA-256 of a versioned runtime manifest;
- the stable CodexLattice ownership marker.

Before importing the routing runtime, that bootstrap verifies the manifest digest and every executable runtime file listed by the manifest. An integrity failure does **not** load the altered runtime; the hook returns fail-open so ordinary Codex remains usable. `codex-lattice doctor --strict` treats the same state as an installation error and also executes a synthetic no-model hook probe to verify that the trusted command can actually start and return routing context.

Receipt hashes and transactional installation rollback remain a separate integrity layer. They do not replace Codex's hook trust boundary.

## Fail-closed versus fail-open behavior

The two behaviors are intentionally different:

- **install / adaptive activation / strict doctor:** fail closed when Codex configuration, required multi-agent/hooks capabilities, managed ownership, or runtime integrity cannot be established;
- **an already-installed per-turn hook:** fail open on malformed hook input, bootstrap integrity failure, or routing-runtime failure so an extension error does not make the user's ordinary Codex session unusable;
- **`mode single` / uninstall:** remain recovery paths and do not require adaptive-only Codex capabilities to be healthy.

The advanced `codex-lattice run` command has its own explicit-run compatibility checks; those flags are not a prerequisite for transparent adaptive installation.

## Prompt and policy boundary

The `UserPromptSubmit` hook receives the root user prompt because it must classify the task. CodexLattice does not copy that raw text into injected developer context. Only deterministic derived route metadata and a fixed coordinator contract are elevated. Raw task text also remains excluded from CodexLattice local telemetry.

Thread-spawned subagent prompt hooks are ignored to prevent recursive orchestration. Native Codex collaboration-mode, sandbox, and approval restrictions remain authoritative; CodexLattice does not weaken them.

## Security-relevant guarantees

CodexLattice is designed to:

- preserve unrelated user configuration and hooks;
- reject malformed or ambiguous managed ownership states rather than guessing;
- roll back partial adaptive installation failure;
- bind the reviewed hook command to the executable runtime manifest;
- refuse to load a runtime whose manifest or executable files fail integrity verification;
- keep transparent routing disabled/unhealthy in `doctor --strict` when required Codex capabilities or the real hook execution probe fail;
- keep `single` mode available as a recovery path when adaptive-specific capabilities disappear;
- avoid silently changing Codex sandbox, collaboration, hook-trust, or approval settings;
- avoid storing raw task text in local telemetry.

A failure of any of these guarantees can be security relevant depending on impact.

## Out of scope

The following are generally not CodexLattice vulnerabilities by themselves:

- vulnerabilities in Codex, Node.js, or the operating system that reproduce without CodexLattice;
- model behavior/content issues without a CodexLattice routing, trust, or isolation failure;
- unsupported Codex versions that are explicitly rejected;
- exposure caused by posting secrets in public issue reports;
- a local attacker who already has unrestricted write/execute access to the user's account, unless CodexLattice materially expands that attack beyond the existing local capability.

## Disclosure

Please allow reasonable time to investigate and prepare a fix before public disclosure. Confirmed security fixes should document affected versions and remediation without publishing unnecessary exploit detail.
