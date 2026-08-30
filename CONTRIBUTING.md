# Contributing to CodexLattice

Thanks for helping improve CodexLattice. The project is deliberately quality-first: correctness, native Codex compatibility, inspectable behavior, and safe recovery matter more than clever routing or headline cost claims.

## Before opening an issue

For bugs or compatibility problems, collect:

- operating system;
- Node.js version;
- Codex CLI version;
- CodexLattice version;
- current CodexLattice mode (`adaptive` or `single`);
- whether Codex presented/accepted the user-hook review;
- sanitized `codex-lattice doctor --strict` output;
- the smallest reproducible command/configuration.

Never post API keys, session tokens, authentication files, private prompts, proprietary source code, unrelated contents of `~/.codex`, or private benchmark artifacts.

## Development setup

```bash
git clone https://github.com/hamburger-os/CodexLattice.git
cd CodexLattice
npm install
npm test
npm run check
```

To run the real-Codex installation smoke test, install a supported Codex CLI first, then run:

```bash
npm run test:codex-smoke
```

The integration smoke test uses a temporary `CODEX_HOME`; it must not require authenticated/paid model calls.

## Change expectations

### Routing and policy changes

A policy change should explain:

1. which task/stage signals change;
2. which routes can newly win or lose;
3. why the quality floor remains protected;
4. what deterministic tests cover the change;
5. whether paired evaluation is required before making an outcome claim.

Do not introduce fixed percentage quality/cost claims without reproducible evidence.

### Installer, hook, and runtime changes

Installer/runtime changes must preserve these properties:

- adaptive installation and `doctor --strict` fail closed on unsupported or structurally invalid Codex configurations;
- an already-installed per-turn hook fails open on routing/bootstrap failure so Codex remains usable;
- unrelated user config, roles, and hooks are preserved;
- raw user prompt text remains in the user role and is not copied into injected developer context;
- thread-spawned subagents cannot recursively re-enter the full Lattice router;
- Codex's collaboration-mode, sandbox, approval, and hook-trust boundaries are not bypassed;
- the reviewed hook command remains cryptographically bound to the executable runtime manifest before runtime import;
- runtime/role ownership is hash-checked before destructive cleanup;
- partial adaptive installation failure rolls back;
- `single` mode remains a recovery path even when adaptive-only capabilities such as hooks, multi-agent, model catalog, or advanced `codex exec` overrides are unavailable;
- explicit `codex-lattice run` compatibility checks remain scoped to that advanced command rather than blocking normal transparent installation.

When modifying hook command construction, add or update cross-platform tests for paths containing spaces and ensure the real-Codex smoke matrix still exercises `doctor --strict` on Linux, macOS, and Windows.

### Documentation changes

`README.md` is the canonical English project entry point. `README.zh-CN.md` should track user-visible behavior and claims. Deep technical material belongs in `docs/` so the README stays approachable.

Behavior/security changes should update the relevant deep docs in the same PR. In particular, changes to installation ownership, hook trust, runtime integrity, recovery semantics, Codex App boundaries, or compatibility probes should be reflected in `docs/installation.md`, `docs/architecture.md`, `docs/compatibility.md`, `SECURITY.md`, and `docs/codex-app.md` where applicable.

## Pull requests

Keep PRs focused. Include:

- problem statement;
- solution summary;
- risk/compatibility notes;
- test commands and results;
- documentation impact.

For behavior changes, add or update tests in the same PR whenever practical.

## Commit style

Use short imperative commit subjects, for example:

```text
fix: preserve user agent roles during migration
docs: clarify model entitlement boundary
test: cover stable multi-agent backend detection
```

## Security

Do not disclose suspected vulnerabilities in a normal public issue. Follow [`SECURITY.md`](SECURITY.md).

## Code of conduct

Participation in this project is governed by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
