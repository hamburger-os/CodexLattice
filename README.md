# CodexLattice

**Quality-first, cost-efficient orchestration for Codex using GPT-5.6 Sol / Terra / Luna.**

CodexLattice does not try to make every task cheaper. It tries to preserve the best attainable result, then spend as little as possible *without leaving the near-optimal quality region*.

## Why

Static recipes such as “Sol plans, Terra codes, Sol reviews” waste expensive calls on easy work and can still under-spend on genuinely risky work. CodexLattice uses a stage-aware policy:

- **Plan**: Terra for ordinary work; Sol when ambiguity/risk/architecture requires it.
- **Explore**: Luna, parallel only across independent repository questions.
- **Execute**: Terra by default; escalate only on evidence.
- **Verify**: deterministic checks first; Sol reviewer for high-risk, disagreement, or incomplete validation.
- **Fallback**: `single` mode removes CodexLattice's managed orchestration block and returns control to the user's original Codex configuration.

## Objective

For candidate routes `r`:

1. Find predicted quality ceiling `Q*`.
2. Keep routes with `Q(r) >= Q* - δ`.
3. Among those routes, minimize expected cost, then latency.
4. For critical-risk work, set `δ = 0`.

This makes quality the primary objective rather than one term in a cost/quality weighted sum.

## Install

```bash
npm install -g .
codex-lattice install adaptive
codex-lattice doctor
```

The installer backs up `~/.codex/config.toml`, adds a clearly delimited managed block, and installs four native Codex subagents. It does **not** alter sandbox or approval settings. If an unmanaged `[agents]` table already exists, it refuses to overwrite or duplicate it; `single` mode removes only the CodexLattice-managed block and preserves the user baseline.

## Use

```bash
codex-lattice explain "refactor authentication across three modules"
codex-lattice run "refactor authentication across three modules"
```

Switch off orchestration:

```bash
codex-lattice mode single
```

Re-enable:

```bash
codex-lattice mode adaptive
```

Remove CodexLattice-managed files/config:

```bash
codex-lattice uninstall
```

## Roles

| Role | Default model | Effort | Purpose |
|---|---|---|---|
| planner | GPT-5.6 Sol | high | architecture, ambiguity, decomposition, stop conditions |
| explorer | GPT-5.6 Luna | low | bounded repository search/evidence |
| implementer | GPT-5.6 Terra | medium | normal coding work |
| reviewer | GPT-5.6 Sol | high | independent high-rigor verification |

The root policy is **not** required to use every role. Simple tasks should remain simple.

## What v0.1 intentionally does not claim

- No claim that its heuristic quality scores are statistically calibrated yet.
- No claim that three cheap agents equal one stronger model.
- No online RL on real user traffic.
- No fabricated benchmark savings.

The next research milestone is a reproducible task→route→outcome dataset and paired benchmarks against `Sol medium, single agent`.

## Prior art

See `docs/research-notes.md`. CodexLattice is narrower than generic LLM routers: it is a Codex-native lifecycle orchestration policy, not a provider gateway.

## License

Apache-2.0.
