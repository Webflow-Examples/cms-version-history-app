# Documentation map

Implementation review date: **2026-10-06**. The guides below describe the code in
this repository; provider API behavior and hosting limits can change independently.

## Installation and use

1. [Installation](installation.md): fresh deployment and acceptance checks.
2. [Configuration](configuration.md): variables, bindings, domains, and mounts.
3. [User guide](user-guide.md): history, checkpoints, preview links, and restore.
4. [Operations](operations.md): delivery failures, scheduler, backups, upgrades.

## Development and review

- [Architecture and integration](architecture.md): data flow, source map, constraints,
  and integrating into an existing Next.js Cloud app.
- [Development and testing](development.md): reproducible local checks and smoke tests.
- [Application API](api.md): route contracts and authentication boundaries.
- [Agent handoff](agent-handoff.md): a ready-to-use implementation brief and review checklist.
- [Repository agent instructions](../AGENTS.md): constraints for work in this repo.
- [Portable deployment manifest](examples/webflow.template.json): safe starting point for a fork.

## Source of truth

- Shipped behavior: `src/`, verified by `tests/` and the browser smoke scripts.
- Environment variables: `src/lib/env.ts`, the scheduler route, and
  [`.dev.vars.example`](../.dev.vars.example).
- Storage: `src/db/schema.ts`, `src/db/bootstrap.sql.ts`, and `wrangler.json`.
- Current provider behavior: official Webflow docs linked in the guides.

If code and prose disagree, inspect the code and tests and correct the documentation.
Do not infer a feature from an unused API client method, a placeholder table, or a roadmap.

## Example template and license

This repository is a standalone example template under the [MIT license](../LICENSE).
It includes application source, tests, and operational documentation. It does not
include a deployed app identity, a preconfigured source site, credentials, or data.
Review the [current boundaries](../README.md#current-boundaries) before adopting it.
