# Contributing to CodexLattice

Thanks for helping improve CodexLattice. The project is deliberately quality-first: correctness, native Codex compatibility, and inspectable behavior matter more than clever routing or headline cost claims.

## Before opening an issue

For bugs or compatibility problems, collect:

- operating system;
- Node.js version;
- Codex CLI version;
- CodexLattice version;
- sanitized `codex-lattice doctor --strict` output;
- the smallest reproducible command/configuration.

Never post API keys, session tokens, authentication files, private prompts, proprietary source code, or unrelated contents of `~/.codex`.

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

### Installer and runtime changes

Installer/runtime changes must preserve these properties:

- fail closed on unsupported or structurally invalid Codex configurations;
- preserve unrelated user configuration;
- avoid shell invocation where direct process execution is possible;
- roll back partial installation failure;
- detect managed config/role drift before `run`;
- keep `single` mode and uninstall reversible.

### Documentation changes

`README.md` is the canonical English project entry point. `README.zh-CN.md` should track user-visible behavior and claims. Deep technical material belongs in `docs/` so the README stays approachable.

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
