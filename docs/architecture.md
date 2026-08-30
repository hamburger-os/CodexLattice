# Architecture

## Transparent turn path

The normal v0.3 execution path is:

`USER PROMPT -> UserPromptSubmit -> ANALYZE -> ROUTE PLAN -> ROOT COORDINATOR -> { PLAN? | EXPLORE? | EXECUTE | VERIFY? } -> DONE`

`codex-lattice run` is retained only as an explicit CI/debug compatibility path. Ordinary Codex CLI/App turns do not need to launch a second Codex process through the wrapper.

## Deterministic policy boundary

`buildPlan(task)` remains the routing authority. For every lifecycle stage, CodexLattice predicts task-conditioned quality for supported model/effort routes, finds the best predicted quality `Q*`, keeps candidates inside `Q* - delta`, then minimizes nominal cost and latency inside that feasible set. High-risk work uses `delta = 0`.

The `UserPromptSubmit` hook receives the user's root prompt and runs this JavaScript policy before model execution. The hook injects only the resulting route metadata and a fixed coordinator contract as additional developer context. It deliberately does **not** copy raw user prompt text into developer context.

This keeps two trust domains separate:

- user content remains user content;
- deterministic route metadata is elevated as orchestration policy.

## Root coordinator

A hook cannot dynamically replace the already-started root turn's model. Therefore transparent mode treats the root as a coordinator rather than pretending it is the selected execution route.

For repository inspection, tool use, implementation, tests, and other substantive work, the coordinator is instructed to delegate to the exact route-specific agent chosen by the policy. Purely conversational/explanatory work can still be answered directly when delegation adds no value.

The coordinator must not:

- substitute its own model-selection guess for the route plan;
- pass model or reasoning-effort overrides when spawning Lattice roles;
- exceed the route's bounded parallelism;
- escalate before concrete failure, unresolved ambiguity, material disagreement, or elevated risk;
- weaken native Codex collaboration-mode, sandbox, approval, or hook-trust restrictions.

`permission_mode` from the current Hook runtime is treated as approval metadata only; CodexLattice does not infer the UI collaboration/Plan mode from that field. Native Codex instructions remain authoritative for whether implementation is permitted on the turn.

## Native execution backend

Substantive work is enforced through route-specific native Codex agent roles rather than dynamic spawn-model overrides. The installer registers a finite role lattice such as:

- `lattice_plan_terra_medium`
- `lattice_plan_sol_high`
- `lattice_explore_luna_low`
- `lattice_execute_terra_medium`
- `lattice_verify_sol_max`

Each role config pins exactly one model and reasoning effort and contains stage-specific developer instructions. The coordinator only selects `agent_type`.

## Recursion and background-turn guards

Codex 0.149.1 exposes thread-spawned subagent context on lifecycle hook requests. CodexLattice ignores `UserPromptSubmit` events that carry `agent_id` / `agent_type`, so a Lattice worker cannot recursively route itself into another full Lattice workflow.

Current Desktop builds can also produce internal non-resumable turns. CodexLattice fails open when `transcript_path` is explicitly `null` unless `CODEX_LATTICE_ROUTE_EPHEMERAL=1` is set.

The hook runtime itself is fail-open: malformed input, bootstrap integrity failure, or a routing-runtime exception returns `continue: true` rather than making ordinary Codex unusable.

## Manifest-bound self-contained hook runtime

Adaptive install copies the minimal routing runtime into:

`CODEX_HOME/codex-lattice/runtime/<package-version>/`

It contains the policy, role mapping, coordinator-context generator, hook handler, ESM package marker, runner, and a generated runtime manifest. The manifest records the SHA-256 of every executable runtime file.

Starting with v0.3.1, the `hooks.json` command no longer trusts only a mutable launcher path. The reviewed command contains:

- the Node executable used during installation;
- a small inline verifier bootstrap;
- the runtime-manifest path;
- the expected manifest SHA-256;
- the stable Lattice ownership marker.

Before importing `hook-runner.js`, the inline bootstrap verifies the manifest digest and then every executable file listed by the manifest. If anything differs, the altered runtime is not imported and the turn fails open to native Codex.

This gives the hook trust boundary an executable-content binding: changing a runtime file alone cannot silently cause the reviewed command to load that changed content. Package upgrades produce a new versioned command/runtime and can therefore be reviewed again by Codex according to its own trust policy.

The same runtime files are independently hashed in the installation receipt.

## Installation integrity

Adaptive installation is transactional and fail-closed:

`PROBE BASE CODEX -> PARSE BASELINE -> SNAPSHOT -> WRITE ROLES -> WRITE RUNTIME+MANIFEST -> MERGE TRUSTED HOOK -> WRITE CONFIG -> NATIVE FEATURE CHECK -> SYNTHETIC HOOK EXECUTION -> RECEIPT`

A structural validation failure restores the pre-install snapshot. Existing user hooks and unrelated agent roles are preserved. The managed hook carries a stable ownership marker so mode changes and uninstall remove only the CodexLattice handler.

Adaptive reinstall preserves the original pre-Lattice ownership state of `hooks.json`. On version upgrades, unchanged superseded runtimes are retired after the new installation validates, while files whose receipt hashes show external modification are preserved instead of deleted speculatively.

When transparent routing is required, an effective `hooks=false`, missing multi-agent backend, command/runtime integrity failure, or failed synthetic Hook execution is a structural error rather than a warning: an installation that cannot receive and route ordinary prompts must not claim transparent adaptive mode.

Codex itself owns user-hook trust. CodexLattice does not write trusted hashes or bypass the one-time review boundary.

## Capability separation and recovery

v0.3.1 deliberately separates capability gates:

- baseline installation/recovery requires a supported Codex CLI and parseable baseline config;
- adaptive mode additionally requires hooks, multi-agent, route roles, trusted runtime execution, and model-catalog checks where available;
- advanced `codex-lattice run` separately requires the `codex exec` runtime override flags it uses.

This prevents an optional compatibility command from blocking ordinary transparent installation and keeps `mode single` useful even when adaptive-only upstream surfaces are temporarily unavailable.

## Parallelism

Parallelism is a route/coordinator constraint rather than a blanket global concurrency rewrite:

- exploration <= 3 and only for independent questions;
- implementation <= 2 and only for independent write workstreams;
- serial dependencies remain serial.

## Verification

Deterministic tests, type checks, static analysis, reproducible commands, and direct repository evidence are preferred over model voting. Stronger Sol review routes are reserved for risk, validation gaps, or evidence-backed escalation.

`doctor --strict` adds structural validation that normal Hook turns intentionally do not perform on every request. It verifies static receipt/runtime integrity and executes a synthetic no-model prompt through the exact trusted command, requiring actual routing context. This catches stale Node paths, command drift, manifest drift, and startup failures while preserving fail-open behavior during ordinary conversations.

## Calibration path

The seed router remains transparent rather than learned. Outcome calibration uses the versioned paired-evaluation protocol while preserving the lexicographic quality-floor objective.
