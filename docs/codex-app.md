# Codex App compatibility

CodexLattice distinguishes shared Codex configuration compatibility from native Codex App orchestration. Passing the CLI smoke suite is not treated as proof that every desktop UI flow is routed through CodexLattice.

## Supported boundary

CodexLattice installs native Codex agent roles and managed configuration under the active Codex home. Those files are designed to remain valid for Codex surfaces that consume the same configuration. The project therefore treats **shared configuration compatibility** with Codex App as an explicit target.

The supported claim is deliberately narrower than “full App integration”:

- CodexLattice-managed configuration and role files must remain parseable and non-destructive;
- unrelated user configuration must be preserved;
- `single`, `adaptive`, `doctor --strict`, and uninstall must remain reversible from the CLI;
- a compatible Codex App installation should be able to coexist with the same Codex configuration without requiring a second CodexLattice-specific config tree.

CodexLattice does **not** currently claim that starting an arbitrary task from the Codex App UI automatically invokes `codex-lattice run`, or that every App-specific process/environment path has been regression-tested.

## Automated evidence

The protected CI matrix tests the pinned Codex CLI baseline on Ubuntu, macOS, and Windows. A separate non-blocking `Codex latest canary` workflow installs `@openai/codex@latest` on the same operating systems and runs the structural install/doctor/mode/uninstall smoke without authenticated model calls.

These jobs validate the shared configuration contract. They do not launch or drive the desktop UI.

## Desktop acceptance checklist

Before upgrading the project claim from “shared configuration compatible” to “desktop App verified,” capture an actual App version and operating system and complete all of the following on a disposable/test Codex profile:

1. install CodexLattice in `adaptive` mode and require `codex-lattice doctor --strict` to pass;
2. launch Codex App and confirm it starts without configuration parse errors or config migration that removes the managed block;
3. confirm CodexLattice role files remain unchanged after the App starts and exits;
4. exercise at least one App task that uses native multi-agent behavior, if the App exposes that surface, and inspect resulting behavior without assuming the CLI entry point was used;
5. switch to `single`, relaunch the App, and verify the user's baseline Codex configuration remains usable;
6. re-enable `adaptive`, relaunch, and re-run `doctor --strict`;
7. uninstall CodexLattice and verify the App still starts with the restored baseline configuration.

Record the App version, Codex CLI version bundled or installed alongside it, OS, and sanitized observations. Do not record credentials or private prompts.

## Claim levels

| Surface | Current status | What is proven |
| --- | --- | --- |
| Codex CLI pinned baseline | Supported / blocking CI | cross-platform structural integration and lifecycle restore |
| Newer Codex CLI | Canary | weekly structural compatibility signal; not a release guarantee |
| Codex App shared config | Compatibility target | managed config/roles are designed to coexist on the shared Codex configuration surface |
| Codex App native UI orchestration | Not yet claimed | requires the desktop acceptance checklist and an upstream-supported integration path |

Any future README statement that says “Codex App supported” must preserve this distinction unless desktop verification evidence is published.
