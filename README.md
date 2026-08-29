# CodexLattice

**Quality-first, cost-efficient orchestration for Codex using GPT-5.6 Sol / Terra / Luna.**

CodexLattice is a Codex-native reasoning-resource scheduler. It tries to preserve the best attainable result, then spend as little as possible *without leaving the near-optimal quality region*.

> **v0.2.4 hardens installation and runtime enforcement.** Installation is now fail-closed: CodexLattice probes the real Codex CLI, writes route-specific native agent roles, asks Codex to parse the resulting configuration, writes a validated installation receipt, and rolls back automatically if validation fails. `run` refuses to start if that validated installation has drifted.

## Why

Static recipes such as “Sol plans, Terra codes, Sol reviews” waste expensive calls on easy work and can still under-spend on genuinely risky work. CodexLattice uses a stage-aware policy:

- **Plan**: Terra for ordinary work; Sol when ambiguity/risk/architecture requires it.
- **Explore**: Luna, parallel only across independent repository questions.
- **Execute**: Terra/Luna when predicted quality remains near the ceiling; escalate only on evidence.
- **Verify**: deterministic checks first; Sol reviewer for high-risk, disagreement, or incomplete validation.
- **Critical ceiling**: `max` reasoning is eligible only for critical planning/verification paths.
- **Fallback**: `single` mode removes CodexLattice's managed orchestration block and returns control to the user's original Codex configuration.

## Objective

For candidate routes `r`:

1. Estimate task-conditioned quality `Q(r | task, stage)`.
2. Find the predicted quality ceiling `Q*`.
3. Keep routes with `Q(r) >= Q* - δ`.
4. Among those routes, minimize nominal cost, then latency.
5. For high-risk work, set `δ = 0`.

This is lexicographic optimization: quality is not traded away by a cost weight. The current quality model is intentionally simple and inspectable. `cost` is a ranking index, **not** a bill estimator.

## Prerequisite

CodexLattice v0.2.4 requires **Codex CLI >= 0.149.0** and is integration-tested against **0.149.1**.

Install/update Codex using one of the official distribution paths:

```bash
npm install -g @openai/codex
# or
brew install --cask codex

codex --version
```

CodexLattice does not silently install or replace Codex for you.

## Install CodexLattice

From a clone:

```bash
git clone https://github.com/hamburger-os/CodexLattice.git
cd CodexLattice
npm install -g .

codex-lattice install adaptive
codex-lattice doctor --strict
```

Or install the GitHub repository directly with npm, then run the same native installer:

```bash
npm install -g https://github.com/hamburger-os/CodexLattice.git
codex-lattice install adaptive
codex-lattice doctor --strict
```

`install adaptive` is not a cosmetic config writer. It performs a transaction:

1. verifies a supported `codex` binary is on `PATH`;
2. verifies `codex exec` exposes the runtime model/config override surface CodexLattice needs;
3. backs up the existing `~/.codex/config.toml`;
4. preserves unrelated user-defined `[agents.*]` roles;
5. writes route-specific native role files under `~/.codex/agents/`;
6. registers those roles in a clearly delimited managed block;
7. runs the installed Codex CLI against that `CODEX_HOME` (`codex features list`) so Codex itself must accept the active configuration;
8. optionally probes the bundled model catalog;
9. writes `~/.codex/codex-lattice/install.json` with the validated Codex version and role/config hashes;
10. restores the pre-install state automatically if native validation fails.

It does **not** alter sandbox or approval settings.

### Why route-specific native roles?

Current Codex builds can conditionally hide `model` / `reasoning_effort` fields from the `spawn_agent` tool. CodexLattice therefore does not depend on a prompt asking the parent to override those fields.

Instead, the installer creates native roles such as:

```text
lattice_plan_sol_high
lattice_explore_luna_low
lattice_execute_terra_medium
lattice_verify_sol_max
```

Each role's own Codex config file pins its model and reasoning effort. The orchestration prompt names the exact `agent_type` selected by the router. This makes the selected subagent route a configuration property, not a best-effort prompt instruction.

The root `codex exec` invocation is also launched with the selected EXECUTE model and reasoning effort via CLI overrides.

## Verify the installation

```bash
codex-lattice doctor --strict
```

The doctor checks:

- Codex executable and supported version;
- runtime `--model` / config override capability;
- native parsing of the active `CODEX_HOME` configuration;
- at least one enabled Codex multi-agent backend (`multi_agent` or `multi_agent_v2`);
- validated installation receipt;
- managed-block integrity;
- every installed route-role file and its SHA-256 hash;
- optional visibility of the GPT-5.6 Luna/Terra/Sol model slugs in Codex's bundled catalog.

A missing model-catalog probe is reported as a warning because local catalog visibility and account entitlement are not the same thing. A structural installation error is an error. With `--strict`, warnings also return a non-zero exit code.

## Use

Inspect a route:

```bash
codex-lattice explain "refactor authentication across three modules"
```

Inspect the complete candidate set and rejection reasons:

```bash
codex-lattice explain --trace "refactor authentication across three modules"
```

Counterfactual shadow view against a Sol-medium single-agent reference:

```bash
codex-lattice shadow "refactor authentication across three modules"
```

Run through Codex:

```bash
codex-lattice run "refactor authentication across three modules"
```

`run` performs a lightweight preflight before invoking Codex. If adaptive mode is not active, the installation receipt is missing/stale, the managed block changed, a route file was deleted, a role file was modified, **or the Codex CLI version changed since validation**, it refuses to run and tells you to repair/revalidate the installation.

Switch off orchestration without replacing your original model settings:

```bash
codex-lattice mode single
```

Re-enable and revalidate:

```bash
codex-lattice mode adaptive
```

Remove CodexLattice-managed configuration and role files:

```bash
codex-lattice uninstall
```

## Local telemetry (opt-in)

Telemetry is disabled by default and stays local. Raw task text is never written by CodexLattice telemetry.

```bash
codex-lattice telemetry on
codex-lattice telemetry status
codex-lattice telemetry summarize
```

When telemetry is on, `run` prints a run id. Optionally attach a quality label:

```bash
codex-lattice feedback <run-id> pass
codex-lattice feedback <run-id> mixed "tests pass but implementation is too invasive"
```

See [`docs/evaluation.md`](docs/evaluation.md) for the paired benchmark and calibration protocol.

## CI proof boundary

The repository runs unit/configuration tests on Linux, macOS, and Windows. It also has a **real Codex install smoke job** on all three platforms that installs `@openai/codex@0.149.1`, globally installs the CodexLattice npm package, verifies the global `codex-lattice` command, creates a temporary `CODEX_HOME`, runs `install adaptive`, requires `doctor --strict` to pass, verifies an enabled multi-agent backend and all three GPT-5.6 route slugs, switches `single → adaptive` with strict validation, and uninstalls while proving the baseline config is restored.

That smoke test deliberately does not claim model-account entitlement or perform paid/authenticated model calls. Actual Luna/Terra/Sol availability still depends on the user's Codex account. The installer reports that boundary instead of pretending configuration alone proves entitlement.

## Configuration coexistence

CodexLattice owns only role names prefixed with `lattice_` inside its managed block and files named `codex-lattice-*.toml` under `~/.codex/agents/`.

- Unrelated `[agents.custom]` roles are preserved.
- An existing CodexLattice-owned role name outside the managed block is treated as a collision and installation stops.
- A top-level inline `agents = { ... }` table is rejected because extending it safely with additional TOML subtables is ambiguous.
- An explicit `[agents] enabled = false` (or explicit multi-agent disable) is respected: adaptive installation stops instead of silently overriding the user's choice.
- `single` mode is passthrough: it removes only the CodexLattice managed block and route files.

## What v0.2.4 intentionally does not claim

- Heuristic quality values are not calibrated probabilities yet.
- Multiple cheaper agents are not assumed to equal one stronger model.
- There is no fixed percentage cost-saving or speedup claim without paired eval evidence.
- Native configuration validation does not prove account entitlement to every model.
- CI does not make authenticated/paid model calls.

The next milestone is reproducible paired evaluation and calibration. See [Issue #1](https://github.com/hamburger-os/CodexLattice/issues/1).

## Prior art

See [`docs/research-notes.md`](docs/research-notes.md). CodexLattice is narrower than generic LLM routers: it is a Codex-native lifecycle orchestration and reasoning-resource policy, not a provider gateway.

## License

Apache-2.0.
