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

> **v0.3.0:** adaptive mode is transparent. After installation, ordinary root turns in Codex are routed by a `UserPromptSubmit` hook. `codex-lattice run` remains available for explicit CI/debug execution, but it is no longer the normal chat entry point.

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
- a versioned self-contained hook runtime under `CODEX_HOME/codex-lattice/runtime/<version>/`.

```text
ordinary user prompt
        │
        ▼
UserPromptSubmit hook
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

Subagent `UserPromptSubmit` turns are ignored by the hook, preventing recursive Lattice routing. Hook failures also fail open so a routing-extension failure does not make ordinary Codex unusable.

## Routing objective

For each stage and candidate route `r`:

1. estimate task-conditioned quality `Q(r | task, stage)`;
2. find the predicted ceiling `Q*`;
3. keep routes with `Q(r) >= Q* - δ`;
4. minimize nominal cost, then latency, inside that set;
5. set `δ = 0` for high-risk work.

The current quality values are transparent seed heuristics, not calibrated probabilities. The `cost` field is a ranking index, not a billing estimate.

Typical behavior:

- **Plan:** Terra for ordinary work; Sol for ambiguity, architecture, or higher risk.
- **Explore:** Luna by default, with bounded parallelism only for independent repository questions.
- **Execute:** Luna/Terra when quality remains near the predicted ceiling; stronger routes on evidence.
- **Verify:** deterministic checks first; stronger independent review for higher-risk or incompletely validated changes.

## Inspect routing

```bash
codex-lattice explain "refactor authentication across three modules"
codex-lattice explain --trace "refactor authentication across three modules"
codex-lattice shadow "refactor authentication across three modules"
```

For explicit CI/debug execution, the compatibility path still exists:

```bash
codex-lattice run "refactor authentication across three modules"
```

The child process is marked so the transparent hook does not route the same task a second time.

## Transactional installation

`codex-lattice install` validates Codex, preserves unrelated config/roles/hooks, installs route roles and the versioned hook runtime, merges the managed hook, asks Codex to parse the resulting configuration, checks multi-agent/hook/model signals, and writes an integrity receipt.

If validation fails, managed changes are rolled back. `doctor --strict` verifies the managed config block, role hashes, hook handler, runtime hashes, Codex version, multi-agent backend, hook feature, and local model catalog.

CodexLattice never writes Codex's hook trust state on the user's behalf.

## Modes and uninstall

```bash
# Disable transparent routing and restore the user's baseline behavior.
codex-lattice mode single

# Re-enable transparent adaptive routing.
codex-lattice mode adaptive

# Remove CodexLattice-owned config, hook, roles, runtime, and receipt.
codex-lattice uninstall
```

Unrelated `hooks.json` handlers are preserved. Runtime files are removed only when the receipt hash still proves ownership; modified files are left in place instead of being guessed away.

## Codex App

v0.3 is designed for the shared user hook/config layer used by Codex CLI and Codex App, so the intended desktop flow is also simply **open the app and chat normally**.

Current upstream boundaries are documented rather than hidden:

- the user-level hook may need one-time Codex review;
- Desktop can emit internal non-resumable turns, so CodexLattice skips turns whose `transcript_path` is explicitly `null` by default (`CODEX_LATTICE_ROUTE_EPHEMERAL=1` opts in);
- image attachment contents are not currently present in the `UserPromptSubmit` classifier payload, so multimodal routing uses the text portion;
- automated CI validates the real Codex CLI and shared configuration, while full desktop UI acceptance remains a separate check.

See [`docs/codex-app.md`](docs/codex-app.md).

## Local telemetry (opt-in)

Telemetry is disabled by default, stays local, and never writes raw task text.

```bash
codex-lattice telemetry on
codex-lattice telemetry status
codex-lattice telemetry summarize
codex-lattice feedback <run-id> pass
```

See [`docs/evaluation.md`](docs/evaluation.md) for the paired-evaluation and calibration protocol.

## Evidence boundary

CI runs unit/configuration tests on Linux, macOS, and Windows. A real-Codex smoke matrix installs `@openai/codex@0.149.1`, installs CodexLattice globally, validates a temporary `CODEX_HOME`, checks multi-agent and hook backends plus GPT-5.6 route slugs, exercises `adaptive → single → adaptive`, and confirms uninstall restores the baseline.

The repository does **not** claim that heuristic quality values are calibrated probabilities, that multiple cheaper agents equal one stronger model, a fixed cost/speed saving, that model-catalog visibility proves account entitlement, that CI performs paid model calls, or that CLI smoke is equivalent to exhaustive Codex App UI validation.

## Documentation

- [Installation](docs/installation.md)
- [Architecture](docs/architecture.md)
- [Codex compatibility](docs/compatibility.md)
- [Codex App compatibility](docs/codex-app.md)
- [Evaluation and calibration](docs/evaluation.md)
- [Roadmap](docs/roadmap.md)
- [Changelog](CHANGELOG.md)

## License

Apache-2.0. See [`LICENSE`](LICENSE).

---

CodexLattice is an independent open-source project. It is not affiliated with, sponsored by, or endorsed by OpenAI.
