# Evaluation results

Measured result files are intentionally not committed by default. Local JSON/JSONL outputs and raw artifacts are gitignored so authenticated task content and model output are not accidentally published.

A future public evidence release should commit only a reviewed, sanitized, versioned aggregate/result set that follows `eval/result.schema.json`, identifies the corpus and runner-config versions, and clearly states coverage and missing measurements.

The presence of the harness or seed corpus must never be presented as measured quality, latency, or cost evidence.
