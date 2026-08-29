# Security Policy

CodexLattice modifies local Codex configuration and launches the Codex CLI, so installation integrity and configuration boundaries are treated as security-relevant behavior.

## Supported versions

Security fixes are provided for the latest released CodexLattice version. Older versions may be asked to upgrade before a report is investigated.

## Reporting a vulnerability

Please do **not** publish exploit details, tokens, credentials, private prompts, or sensitive local configuration in a normal GitHub issue.

Preferred reporting path:

1. Use GitHub's **Report a vulnerability** / private security advisory flow for this repository when available.
2. If that flow is unavailable, open a public issue titled `[SECURITY] Request private contact` containing only a high-level description and no exploit details. A private channel can then be established.

Useful information includes the affected CodexLattice version, Codex version, operating system, impact, reproduction conditions, and whether the issue requires a malicious repository/task/configuration.

## Security boundaries

CodexLattice is designed to:

- write only its managed Codex configuration block and owned `codex-lattice-*.toml` role files;
- preserve unrelated user configuration;
- back up configuration before mutation;
- roll back failed installation validation;
- refuse adaptive execution when validated managed state drifts;
- avoid silently changing Codex sandbox or approval settings;
- avoid storing raw task text in local telemetry.

A failure of any of these guarantees can be security relevant depending on impact.

## Out of scope

The following are generally not CodexLattice vulnerabilities by themselves:

- vulnerabilities in Codex or Node.js that reproduce without CodexLattice;
- model behavior/content issues without a CodexLattice routing or isolation failure;
- unsupported Codex versions that are explicitly rejected;
- exposure caused by posting secrets in public issue reports.

## Disclosure

Please allow reasonable time to investigate and prepare a fix before public disclosure. Confirmed security fixes should document affected versions and remediation without publishing unnecessary exploit detail.
