# Codex App compatibility

CodexLattice v0.3 uses Codex's user-level `UserPromptSubmit` lifecycle hook instead of requiring the desktop UI to invoke `codex-lattice run`. This gives Codex App and Codex CLI a shared transparent integration path whenever they load the same user Codex configuration and hook layer.

v0.3.1 hardens that shared path without changing the App UX: the reviewed hook command is bound to a versioned runtime manifest, and strict health checks execute the installed command with a synthetic no-model prompt before reporting transparent routing healthy.

## Intended desktop experience

After:

```bash
codex-lattice install
codex-lattice doctor --strict
```

the normal App flow is simply:

1. open Codex App;
2. open/select a workspace;
3. send an ordinary prompt;
4. approve the CodexLattice user hook once if Codex presents a hook review prompt;
5. continue chatting normally.

There is no CodexLattice-specific App command, model picker, or per-workspace routing configuration.

## How the App path works

Adaptive installation creates:

- route-specific native agent roles under the active Codex home;
- one marker-owned `UserPromptSubmit` command hook in `hooks.json`;
- a versioned self-contained hook runtime plus integrity manifest under `CODEX_HOME/codex-lattice/runtime/<version>/`.

For a root user turn, the trusted command first verifies the runtime-manifest SHA-256 and the hashes of every executable runtime file. Only then does the hook run the deterministic `buildPlan()` policy and inject derived routing metadata plus coordinator rules. Raw user prompt text stays in the user role and is not copied into developer context. The root coordinator then delegates repository/tool work to the exact route-specific native agents.

If runtime verification or Hook execution fails, the turn fails open to native Codex rather than loading altered routing code. `doctor --strict` treats the same condition as an installation error.

Thread-spawned subagents expose `agent_id` / `agent_type`; CodexLattice skips those hook invocations so delegation cannot recursively re-route itself.

## Current upstream boundaries

Transparent desktop routing is implemented, but several Codex lifecycle details remain outside CodexLattice's control:

- **Hook trust:** non-managed user hooks can require a one-time Codex review. CodexLattice installs the hook but does not write trust state itself. Version upgrades can change the reviewed command/runtime and may therefore be reviewed again according to Codex policy.
- **Internal desktop turns:** current Desktop builds can produce non-resumable internal turns. CodexLattice fails open when `transcript_path` is explicitly `null`, unless `CODEX_LATTICE_ROUTE_EPHEMERAL=1` is set.
- **Images:** current `UserPromptSubmit` input exposes the text prompt but not image attachment contents. Route classification for multimodal turns therefore uses the text portion only.
- **Desktop automation:** repository CI can install and validate the real Codex CLI on Linux/macOS/Windows, but it does not drive every released Codex App UI build.

These are compatibility boundaries, not reasons to maintain a second App-specific CodexLattice configuration.

## Automated evidence

Blocking CI installs the pinned real Codex CLI baseline on Ubuntu, macOS, and Windows and verifies:

- `hooks` and multi-agent backends are enabled in adaptive mode;
- the managed `UserPromptSubmit` handler parses from the real Codex home;
- the installed command matches the current package-generated manifest-bound command;
- the self-contained hook runtime exists and matches its receipt hashes;
- a synthetic no-model prompt through that exact command returns real routing context;
- GPT-5.6 route roles/model slugs are present;
- `adaptive → single → adaptive` is reversible;
- `single` remains a recovery mode independent of adaptive-only capability health;
- uninstall restores the user's baseline and removes only CodexLattice-owned hook/runtime assets.

A separate latest-Codex canary remains an early compatibility signal rather than a release guarantee.

## Desktop acceptance checklist

For an App release/OS combination, use a disposable/test Codex profile and record:

1. `codex-lattice install` and `doctor --strict` succeed;
2. the App opens the same profile without rewriting/removing the managed config/hook;
3. the first ordinary prompt presents hook review if needed, then subsequent prompts do not require CodexLattice-specific commands;
4. a repository task shows native subagent delegation consistent with the selected route;
5. a subagent turn does not create recursive Lattice delegation;
6. `mode single` disables transparent routing while preserving baseline App behavior;
7. `mode adaptive` restores it;
8. uninstall leaves the App usable and preserves unrelated hooks/config.

Record App version, Codex CLI/runtime version, CodexLattice version, OS, whether hook review appeared, and sanitized observations only.

## Claim levels

| Surface | v0.3 status | Evidence |
| --- | --- | --- |
| Codex CLI pinned baseline | Supported / blocking CI | cross-platform hook + agent + lifecycle smoke |
| Newer Codex CLI | Canary | structural compatibility signal |
| Codex App shared config/hooks | Implemented integration path | same user-level hook/config assets; no separate Lattice App config |
| Every Codex App release/UI flow | Acceptance-tested per version | requires the desktop checklist; not implied by CLI CI alone |
| Image-aware route classification | Limited | text portion only until attachment metadata reaches the hook payload |
