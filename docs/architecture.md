# Architecture

CodexLattice is deliberately not another provider gateway. Codex remains the agent runtime; CodexLattice supplies the decision policy, role definitions, safe configuration installer, and a thin `codex exec` wrapper.

## State machine

`ANALYZE -> PLAN? -> EXPLORE? -> EXECUTE -> VERIFY -> {DONE | REPLAN | ESCALATE}`

Fan-out is permitted only for independent workstreams. Verification prefers deterministic evidence (tests, static analysis, type checks, reproducible commands) over LLM voting.

## Quality-first objective

For feasible routes r, estimate quality Q(r), cost C(r), and latency L(r). Let `Q* = max Q(r)`. Keep only routes satisfying `Q(r) >= Q* - delta`, then minimize `(C(r), L(r))` lexicographically. Critical-risk tasks use `delta = 0`.

The v0.1 quality estimator is intentionally heuristic and transparent. The intended evolution is: logged outcomes -> calibrated success predictor -> shadow learned router -> canary rollout. Do not claim learned optimality before benchmark evidence exists.
