# Native installation contract

CodexLattice treats installation as a compatibility transaction, not as text insertion into `config.toml`.

## Supported baseline

- Node.js >= 20
- Codex CLI >= 0.149.0
- integration baseline: Codex CLI 0.149.1

Codex 0.149.1 exposes both the stable `hooks` feature and native multi-agent support required by transparent adaptive mode.

## Capability boundaries

v0.3.1 separates three compatibility surfaces instead of treating them as one global prerequisite:

1. **base Codex compatibility** — a supported, parseable Codex CLI is required for installation, mode changes, and recovery;
2. **transparent adaptive capability** — adaptive mode additionally requires the generated config to parse, an enabled native multi-agent backend, an enabled hooks backend, and a working trusted hook runtime;
3. **advanced explicit-run capability** — `codex-lattice run` additionally requires the `codex exec --model` / config-override surface used by that compatibility command.

The third surface is not required for ordinary transparent installation. `mode single` intentionally does not require adaptive-only capabilities, so it remains an escape hatch if hooks, multi-agent, model-catalog, or explicit-run behavior changes upstream.

## Adaptive install transaction

`codex-lattice install` defaults to `adaptive` and performs these steps:

1. probe `codex --version` before modifying files;
2. reject unsupported Codex versions;
3. inspect the existing Codex config and reject unsafe namespace collisions, explicit multi-agent disable, or explicit `hooks = false`;
4. parse any existing `hooks.json` before mutation and reject malformed structures rather than guessing;
5. snapshot the managed config, hook file, route files, runtime files, and receipt;
6. create timestamped backups of pre-existing `config.toml` and `hooks.json`;
7. atomically write route-specific native agent role files;
8. atomically install a versioned self-contained hook runtime under `CODEX_HOME/codex-lattice/runtime/<version>/`;
9. generate a runtime manifest containing the SHA-256 of every executable routing-runtime file;
10. merge exactly one marker-owned `UserPromptSubmit` command handler into `hooks.json`, preserving unrelated user hooks;
11. bind that reviewed command to the pinned Node executable, inline verifier bootstrap, runtime-manifest path, and manifest SHA-256;
12. atomically write the managed agent registration block into `config.toml`;
13. execute `codex features list` with the target `CODEX_HOME` and require the active configuration to parse;
14. require an enabled native multi-agent backend and enabled stable hooks feature;
15. execute a synthetic no-model `UserPromptSubmit` through the exact installed trusted command and require real routing context;
16. probe the bundled model catalog when supported;
17. write a schema-v2 receipt containing config, role, hook, and runtime integrity metadata;
18. on any failure after mutation begins, restore the snapshot and remove failed-install backups.

The synthetic hook probe never invokes a model. It proves that the trusted command can start using the installed path, verify its runtime, parse stdin, and return the expected hook output shape.

## Trusted bootstrap and self-contained runtime

Codex App and Codex CLI do not need to resolve the globally installed npm package at hook-execution time. Installation copies only the routing runtime sources needed by the hook into the active Codex home.

The reviewed `hooks.json` command pins the Node executable used during installation and carries a small inline bootstrap plus the expected runtime-manifest digest. Before importing `hook-runner.js`, the bootstrap:

1. reads the versioned manifest;
2. verifies the manifest SHA-256 embedded in the reviewed command;
3. verifies every executable runtime file listed in that manifest;
4. imports the runner only after all checks pass.

If verification fails, the bootstrap does not execute the runtime and emits a fail-open Hook response so ordinary Codex can continue. `doctor --strict` treats the same condition as unhealthy.

This binds the command that Codex reviews to the runtime content that will actually be loaded, rather than trusting only a mutable launcher path. An upgrade changes the versioned command/runtime and may therefore trigger a new Codex review when Codex decides it is necessary.

The runtime contains no credentials or task history. Generated files are also hashed independently in the installation receipt.

## Hook ownership and coexistence

CodexLattice identifies its handler with a stable command marker. It never replaces the entire `hooks.json` document.

- unrelated events, matcher groups, and handlers are preserved;
- reinstall replaces the existing CodexLattice handler instead of duplicating it;
- adaptive reinstall preserves whether `hooks.json` existed **before the first managed install**, rather than reclassifying the file as user-owned merely because a previous Lattice install created it;
- `mode single` removes only the CodexLattice handler and owned runtime;
- uninstall preserves a genuinely pre-existing `hooks.json` file even when all CodexLattice entries are gone;
- a `hooks.json` created solely by CodexLattice is removed when no unrelated user content remains;
- runtime files are deleted only when their actual hash matches the receipt hash.

Malformed or ambiguous ownership states are rejected fail-closed.

## Upgrade runtime retirement

Versioned runtimes allow a new package to install alongside the previous receipt during the transaction. After the new adaptive installation validates successfully, CodexLattice retires the superseded receipt runtime only when its files still match their recorded hashes.

If a superseded runtime file was changed outside CodexLattice, that file is preserved and reported instead of being deleted speculatively. This keeps upgrades tidy without weakening ownership guarantees.

## Hook trust

Codex requires review/trust for non-managed user hooks. CodexLattice installs the handler but **does not write Codex's trust state or trusted hash**. The expected user experience is one Codex review when the hook is first encountered, after which normal chats require no CodexLattice-specific command. A command change on upgrade may be reviewed again according to Codex's own policy.

## Why route-specific roles are the execution backend

The transparent hook can inject routing context but does not dynamically replace the root turn's model. Therefore the root becomes a coordinator and substantive repository/tool work is delegated to native route-specific roles:

- root config declares `agents.lattice_<stage>_<tier>_<effort>`;
- each role points at a file under `CODEX_HOME/agents`;
- each role config pins `model` and `model_reasoning_effort`;
- the coordinator selects the exact `agent_type` from the deterministic route plan without passing model/effort overrides.

## Integrity gates

`codex-lattice doctor --strict` verifies:

- the managed adaptive config block and receipt hash;
- every route-specific role file;
- exactly one CodexLattice `UserPromptSubmit` handler with the receipt-recorded handler body;
- every self-contained runtime file hash;
- the currently installed Codex version;
- native config parsing, multi-agent backend, hooks feature signal, and model-catalog signal when adaptive mode is active;
- the current package-generated trusted hook command matches the installed command;
- a synthetic no-model execution of that command returns real `UserPromptSubmit` routing context.

This final execution probe catches states that static file existence alone cannot, including a stale/moved pinned Node executable or a runtime that fails before returning routing context.

In `single` mode, strict doctor validates the baseline Codex/config state without requiring adaptive-only multi-agent/hooks/model surfaces.

The explicit `codex-lattice run` command retains its fail-closed managed-state preflight and separately checks the `codex exec` model/config override surface. Its child sets `CODEX_LATTICE_BYPASS_HOOK=1` so the task is not routed twice.

## Proof boundary

The installer proves structural compatibility with the local Codex executable and the generated user configuration. It cannot prove account entitlement to every configured model without authenticated model calls, and CLI CI does not substitute for acceptance testing every desktop App release.
