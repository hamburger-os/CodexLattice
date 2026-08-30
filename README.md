<div align="center">
  <img src="assets/brand/banner.svg" alt="CodexLattice — quality-first reasoning orchestration for Codex" width="100%" />
</div>

<div align="center">

[English](README.md) · [简体中文](README.zh-CN.md)

[![CI](https://github.com/hamburger-os/CodexLattice/actions/workflows/ci.yml/badge.svg)](https://github.com/hamburger-os/CodexLattice/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-Apache--2.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)
![Codex](https://img.shields.io/badge/Codex-%3E%3D0.149.0-111827)

</div>

# CodexLattice

**Quality-first reasoning-resource orchestration for Codex using GPT-5.6 Sol, Terra, and Luna.**

CodexLattice chooses native Codex roles for planning, exploration, execution, and verification. It first preserves a near-optimal predicted quality set, then prefers the least expensive and lowest-latency eligible route.

> **v0.3.1:** adaptive mode remains transparent: install once, then use ordinary Codex chats. This patch hardens recovery and hook trust by separating adaptive capability checks from the advanced `run` command, keeping `mode single` usable when adaptive-only Codex surfaces fail, and binding the reviewed Hook command to a SHA-256 runtime manifest before any routing code is imported.

## Quick start

Prerequisites: **Node.js >= 20** and **Codex CLI >= 0.149.0**. The release matrix tests Codex 0.149.1.

```bash
npm install -g @openai/codex
npm install -g https://github.com/hamburger-os/CodexLattice.git

codex-lattice install
codex-lattice doctor --strict

# Then use Codex normally.
codex
```

From then on, just type ordinary prompts such as:

```text
refactor authentication across three modules
```

No `codex-lattice run`, slash command, model picker, or per-project routing setup is required. Codex may ask for a **one-time review of the installed user hook** before it runs; CodexLattice deliberately leaves that decision to Codex.

## Transparent architecture

Adaptive installation adds three owned components under the user's `CODEX_HOME`:

- route-specific native roles such as `lattice_execute_terra_medium` and `lattice_verify_sol_max`;
- one marker-owned `UserPromptSubmit` handler merged into `hooks.json` without replacing unrelated hooks;
- a versioned self-contained hook runtime plus integrity manifest under `CODEX_HOME/codex-lattice/runtime/<version>/`.

```text
ordinary user prompt
        │
        ▼
UserPromptSubmit hook
        │
        ▼
 trusted bootstrap
  verify manifest + runtime hashes
        │
        ▼
   buildPlan(task)
        │
        ▼
derived route metadata
        │
        ▼
  root coordinator
        │
        ├── PLAN
        ├── EXPLORE
        ├── EXECUTE
        └── VERIFY
             │
             ▼
      native Codex roles
      Luna / Terra / Sol
```

The JavaScript policy remains the routing authority. The hook injects only **derived route metadata and coordinator rules**; it does not copy the raw user prompt into developer context. For repository/tool work, the root is instructed to coordinate the exact selected route-specific agents rather than substituting its own model-selection guess.

Subagent `UserPromptSubmit` turns are ignored by the hook, preventing recursive Lattice routing. Hook failures also fail open so a routing-extension failure does not make ordinary Codex unusable. Native Codex collaboration-mode, sandbox, and approval restrictions remain authoritative; hook approval metadata is not used to guess whether a turn is in Plan mode.

### Hook trust and runtime binding

Codex owns Hook review/trust; CodexLattice does not write trusted-hook state. v0.3.1 strengthens what that reviewed command executes. The command pins the installation's Node executable and carries a small inline verifier plus the expected SHA-256 of a versioned runtime manifest. Before importing the routing runner, the verifier checks the manifest digest and every executable runtime file listed in it.

If those checks fail, the altered runtime is **not loaded** and the Hook returns fail-open so the user's Codex session remains usable. `codex-lattice doctor --strict` treats that condition as unhealthy and additionally sends a synthetic no-model `UserPromptSubmit` through the exact installed command, requiring real routing context before reporting transparent routing healthy.

## Routing objective

For each stage and candidate route `r`:

1. estimate task-conditioned quality `Q(r | task, stage)`;
2. find the predicted ceiling `Q*`;
3. keep routes with `Q(r) >= Q* - δ`;
4. choose the lowest nominal cost, then latency, inside that feasible set;
5. use `δ = 0` for high-risk work.

`cost` is a policy ranking index, **not** a billing estimator.

## Inspect the policy

The explicit inspection commands remain useful even though normal chats route automatically:

```bash
codex-lattice explain "refactor authentication across three modules"
codex-lattice explain --trace "refactor authentication across three modules"
codex-lattice shadow "refactor authentication across three modules"
```

`explain` shows lifecycle routes, `--trace` includes candidates and rejection reasons, and `shadow` compares the policy against a Sol-medium single-agent reference without claiming measured savings.

## Installation integrity

`codex-lattice install` is a transaction. It:

1. validates a supported base `codex` binary;
2. validates the active Codex configuration surface;
3. rejects explicit multi-agent or hooks disablement that would make adaptive mode ineffective;
4. snapshots managed files before mutation;
5. preserves unrelated user-defined roles and hooks;
6. writes route-specific native role files;
7. writes the versioned self-contained hook runtime and SHA-256 manifest;
8. merges one CodexLattice-owned `UserPromptSubmit` handler into `hooks.json`;
9. binds the reviewed command to the pinned Node executable and runtime-manifest digest;
10. registers route roles in a clearly delimited managed config block;
11. asks the real Codex CLI to parse the resulting configuration;
12. requires enabled multi-agent and hooks backends for adaptive mode;
13. executes a synthetic no-model prompt through the exact trusted Hook command and requires routing context;
14. records config, role, hook, and runtime integrity metadata in the installation receipt;
15. rolls the transaction back if structural validation fails.

Reinstalling adaptive mode preserves the original ownership state of `hooks.json`, so uninstall remains exact. Version upgrades retire unchanged superseded runtimes but preserve files whose hashes show that they were modified outside CodexLattice.

Validate at any time:

```bash
codex-lattice doctor --strict
```

## Capability layers, modes, and recovery

v0.3.1 deliberately separates the capabilities needed by different surfaces:

- **base Codex:** required for installation and recovery;
- **transparent adaptive:** additionally requires native multi-agent, hooks, route roles, and a healthy trusted runtime;
- **advanced explicit `run`:** separately requires the `codex exec --model` / config-override flags used only by that command.

This means an upstream change to the advanced `run` surface no longer blocks ordinary transparent installation. More importantly, `mode single` remains a recovery path even if multi-agent, hooks, model-catalog, or explicit-run surfaces are currently unavailable.

```bash
# Temporarily remove adaptive routing while preserving the user's baseline config/hooks.
codex-lattice mode single

# Restore transparent adaptive routing.
codex-lattice mode adaptive

# Remove only CodexLattice-managed config, roles, hook, runtime, and receipt.
codex-lattice uninstall
```

## Advanced explicit execution

`run` remains for CI, debugging, and controlled evaluation:

```bash
codex-lattice run "refactor authentication across three modules"
```

This path launches `codex exec` with the selected execute route and sets a re-entry guard so the transparent hook does not route the same task twice. It performs its own compatibility check for the `codex exec` runtime override flags and is not required for normal interactive use.

## Codex App compatibility

The transparent integration uses Codex's own hook/configuration surface rather than a CodexLattice-specific desktop process. This means Codex surfaces that load the same `CODEX_HOME` can consume the installed roles and `UserPromptSubmit` hook without a separate per-App configuration tree.

The support claim still has an evidence boundary: pinned CLI CI proves the structural hook/config/runtime contract, not every released desktop build or every App-specific internal/background flow. CodexLattice therefore distinguishes shared hook/config integration from per-App-version UI acceptance. See [`docs/codex-app.md`](docs/codex-app.md).

Known upstream boundary: turns with an explicit `null` transcript path are treated as internal/non-resumable and skipped by default. `CODEX_LATTICE_ROUTE_EPHEMERAL=1` is an opt-in override for experiments. The current text classifier also operates on the textual prompt supplied by the hook; image attachment content is not independently inspected by CodexLattice's policy engine.

## Local telemetry (opt-in)

Telemetry is disabled by default and stays local. Raw task text is never written by CodexLattice telemetry.

```bash
codex-lattice telemetry on
codex-lattice telemetry status
codex-lattice telemetry summarize

codex-lattice feedback <run-id> pass
codex-lattice feedback <run-id> mixed "tests pass but implementation is too invasive"
```

See [`docs/evaluation.md`](docs/evaluation.md) for the paired-evaluation and calibration protocol.

## Evidence and proof boundary

Blocking CI runs unit/configuration tests on Linux, macOS, and Windows. A real-Codex smoke matrix installs `@openai/codex@0.149.1`, globally installs CodexLattice, validates a temporary `CODEX_HOME`, requires `doctor --strict`, verifies enabled hooks and multi-agent backends plus expected GPT-5.6 route slugs, executes the manifest-bound trusted Hook command from paths containing spaces, exercises `single → adaptive`, and confirms uninstall restores the baseline. A separate weekly/manual canary runs structural smoke against `@openai/codex@latest`; it is an early-warning signal, not a release guarantee.

The source repository also contains a frozen paired-study contract with a calibration/holdout split, reproducible seeded runner ordering, blind-grading tools, Wilson pass-rate intervals, sanitized evidence export, and a holdout-only fail-closed promotion gate. The current gate requires complete human-score coverage and trustworthy measured reasoning-token coverage; missing usage is never replaced with heuristic cost indices. These research commands are intended for a source checkout and are not required by the installed runtime package.

It deliberately **does not** claim:

- that heuristic quality values are calibrated probabilities;
- that multiple cheaper agents equal one stronger model;
- a fixed percentage cost saving or speedup;
- that local model-catalog visibility proves account entitlement;
- that CI performs authenticated or paid model calls;
- that every Codex App version or internal background flow has been manually verified.

The remaining evidence milestone is to run authenticated repeated trials against the frozen study, independently grade the blind artifacts, collect trustworthy measured efficiency data, pass the holdout promotion gate, and publish sanitized versioned evidence before any routing calibration claim. See [`docs/evaluation.md`](docs/evaluation.md), [`docs/roadmap.md`](docs/roadmap.md), and [Issue #1](https://github.com/hamburger-os/CodexLattice/issues/1).

## Documentation

- [Installation](docs/installation.md)
- [Architecture](docs/architecture.md)
- [Codex compatibility](docs/compatibility.md)
- [Codex App compatibility](docs/codex-app.md)
- [Evaluation and calibration protocol](docs/evaluation.md)
- [Research notes](docs/research-notes.md)
- [Roadmap](docs/roadmap.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## Contributing

Bug reports, compatibility findings, policy ideas, benchmark tasks, and focused pull requests are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before submitting changes.

For compatibility reports, include the operating system, Node version, Codex version, CodexLattice version, current Lattice mode, Hook review/trust observation, and sanitized `doctor --strict` output. For Codex App findings, also include the App version and whether the problem concerns shared hook/config integration or an App-specific UI/runtime flow. Never post tokens, credentials, or private task content.

## License

Apache-2.0. See [`LICENSE`](LICENSE).

---

CodexLattice is an independent open-source project. It is not affiliated with, sponsored by, or endorsed by OpenAI.
