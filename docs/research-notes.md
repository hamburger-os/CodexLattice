# Prior art and design boundary

CodexLattice borrows methods, not branding or code, from several lines of work:

- RouteLLM: preference-trained strong/weak model routing and evaluation discipline.
- FrugalGPT: cascade only when escalation is justified.
- Mixture-of-Agents and self-consistency: conditional ensembles can improve quality, but should not be default fan-out.
- Coding-agent routers such as Autohand Routes and agent-router: explicit policy, observability, hard constraints, and model/specialist separation.
- Codex native subagents: role-scoped model and reasoning-effort configuration makes heterogeneous orchestration possible without rebuilding the coding runtime.

CodexLattice's intended niche is lifecycle orchestration specifically for Codex GPT-5.6: stage-aware planning/exploration/execution/verification, quality-ceiling-first routing, evidence-triggered escalation, bounded parallelism, reversible Codex configuration, and a single-mode escape hatch.
