# Native installation contract

CodexLattice treats installation as a compatibility transaction, not as text insertion into `config.toml`.

## Supported baseline

- Node.js >= 20
- Codex CLI >= 0.149.0
- integration baseline: Codex CLI 0.149.1

The baseline is versioned because Codex's multi-agent schema and tool exposure are evolving. A future Codex release may require the compatibility floor to move.

## Adaptive install transaction

`codex-lattice install adaptive` performs these steps in order:

1. Probe `codex --version` before modifying files.
2. Reject unsupported Codex versions before modifying files.
3. Probe `codex exec --help` for the root runtime override surface.
4. Parse the existing config sufficiently to reject CodexLattice namespace collisions, inline-agent ambiguity, or an explicit multi-agent disable.
5. Snapshot the existing config, prior CodexLattice role files, and installation receipt.
6. Persist a timestamped user-config backup when a config already exists.
7. Atomically write all route-specific role files.
8. Atomically write the managed registration block into `config.toml`.
9. Execute `codex features list` with the target `CODEX_HOME`. A non-zero result is a failed install.
10. Require at least one enabled native multi-agent backend reported by Codex (`multi_agent` or `multi_agent_v2`). If none is enabled, fail and roll back.
11. Probe the bundled model catalog when supported; inability to prove model catalog visibility is a warning rather than a structural failure.
12. Write an installation receipt containing config/role hashes and the validated Codex version.
13. On any failure after mutation begins, restore the snapshot and remove the failed-install backup.

## Why route-specific roles are the compatibility backend

The Codex `spawn_agent` model/reasoning override fields are not unconditionally exposed by current multi-agent tool variants. Route-specific role configs avoid that dependency:

- the root config declares `agents.lattice_<stage>_<tier>_<effort>`;
- each declared role points at a role config file under `CODEX_HOME/agents`;
- that role config pins `model` and `model_reasoning_effort`;
- the parent only needs to choose the correct `agent_type`.

This is intentionally more verbose on disk than four generic roles, but the runtime contract is stronger and easier to audit.

## Run-time gate

`codex-lattice run` refuses to invoke Codex unless:

- adaptive managed config is present;
- a validated adaptive receipt is present;
- the managed block hash matches the receipt;
- every generated route file matches the expected content hash;
- the current Codex version exactly matches the version recorded in the validated receipt (a Codex upgrade/downgrade requires revalidation).

Use `codex-lattice doctor --strict` for the deeper native probe.

## Proof boundary

The installer proves structural compatibility with the local Codex executable. It cannot prove that a user's account is entitled to every configured model without making authenticated model calls. CodexLattice surfaces that as a separate model-availability concern rather than conflating it with installation correctness.
