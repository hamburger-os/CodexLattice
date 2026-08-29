# Native installation contract

CodexLattice treats installation as a compatibility transaction, not as text insertion into `config.toml`.

## Supported baseline

- Node.js >= 20
- Codex CLI >= 0.149.0
- integration baseline: Codex CLI 0.149.1

Codex 0.149.1 exposes both the stable `hooks` feature and native multi-agent support required by transparent adaptive mode.

## Adaptive install transaction

`codex-lattice install` defaults to `adaptive` and performs these steps:

1. probe `codex --version` before modifying files;
2. reject unsupported Codex versions;
3. probe `codex exec --help` for the explicit `codex-lattice run` compatibility path;
4. inspect the existing Codex config and reject unsafe namespace collisions, explicit multi-agent disable, or explicit `hooks = false`;
5. parse any existing `hooks.json` before mutation and reject malformed structures rather than guessing;
6. snapshot the managed config, hook file, route files, runtime files, and receipt;
7. create timestamped backups of pre-existing `config.toml` and `hooks.json`;
8. atomically write route-specific native agent role files;
9. atomically install a versioned self-contained hook runtime under `CODEX_HOME/codex-lattice/runtime/<version>/`;
10. merge exactly one marker-owned `UserPromptSubmit` command handler into `hooks.json`, preserving unrelated user hooks;
11. atomically write the managed agent registration block into `config.toml`;
12. execute `codex features list` with the target `CODEX_HOME` and require the active configuration to parse;
13. require an enabled native multi-agent backend and inspect the stable `hooks` feature signal;
14. probe the bundled model catalog when supported;
15. write a schema-v2 receipt containing config, role, hook, and runtime integrity metadata;
16. on any failure after mutation begins, restore the snapshot and remove failed-install backups.

## Why a self-contained hook runtime

Codex App and Codex CLI do not need to resolve the globally installed npm package at hook-execution time. Installation copies only the routing runtime sources needed by the hook into the active Codex home and writes platform launchers that pin the Node executable used during installation.

This gives the hook a stable, versioned execution target and also makes upgrades naturally change the hook command path. Because Codex owns user-hook trust, an upgraded handler can be reviewed again when Codex decides that is necessary.

The runtime contains no credentials or task history. Its generated files are hashed in the receipt.

## Hook ownership and coexistence

CodexLattice identifies its handler with a stable command marker. It never replaces the entire `hooks.json` document.

- unrelated events, matcher groups, and handlers are preserved;
- reinstall replaces the existing CodexLattice handler instead of duplicating it;
- `mode single` removes only the CodexLattice handler and owned runtime;
- uninstall preserves a pre-existing `hooks.json` file even when all CodexLattice entries are gone;
- runtime files are deleted only when their actual hash matches the receipt hash.

Malformed or ambiguous ownership states are rejected fail-closed.

## Hook trust

Codex requires review/trust for non-managed user hooks. CodexLattice installs the handler but **does not write Codex's trust state or trusted hash**. The expected user experience is one Codex review when the hook is first encountered, after which normal chats require no CodexLattice-specific command.

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
- native config parsing, multi-agent backend, hooks feature signal, and model-catalog signal.

The explicit `codex-lattice run` command still has its original fail-closed preflight and sets `CODEX_LATTICE_BYPASS_HOOK=1` on its child Codex process so the task is not routed twice.

## Proof boundary

The installer proves structural compatibility with the local Codex executable and the generated user configuration. It cannot prove account entitlement to every configured model without authenticated model calls, and CLI CI does not substitute for acceptance testing every desktop App release.
