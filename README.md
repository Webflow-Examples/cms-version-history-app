# CMS Version History App

**An example template for Webflow Cloud.**

[![Deploy to Webflow](https://webflow.com/img/deploy-dark.svg)](https://webflow.com/dashboard/cloud/deploy?repo=https://github.com/Webflow-Examples/cms-version-history-app)

**CMS item history, checkpoints, diffs, and recovery for Webflow.**

This example is a Next.js app you can deploy on Webflow Cloud. It receives CMS webhooks,
stores item snapshots in your environment's D1/R2 storage, and provides a
password-protected interface for reviewing and restoring content.

It manages **one Webflow CMS site and its primary locale per installation**.
It is a deployable application, not a script to paste into Webflow's Designer.

Use it as a starting point to review, adapt, and operate for your own project.
It is example application code, not a built-in Webflow version-history feature.
The deployment flow still requires your own site credentials and app secrets;
then run setup and backfill to begin recording history.

## Start here

| Goal | Read |
|---|---|
| Deploy your own copy | [Installation](docs/installation.md) |
| Configure domains, secrets, and storage | [Configuration](docs/configuration.md) |
| Use checkpoints, comparisons, and restores | [User guide](docs/user-guide.md) |
| Diagnose failures, run jobs, or upgrade | [Operations](docs/operations.md) |
| Review the code or integrate into an existing app | [Architecture and integration](docs/architecture.md) |
| Work on this repository as a coding agent | [AGENTS.md](AGENTS.md) and [agent handoff](docs/agent-handoff.md) |
| Run checks locally | [Development and testing](docs/development.md) |
| Call the application's endpoints | [Application API](docs/api.md) |

**Portable by default:** `webflow.json` contains only the framework declaration.
This repository has no attached app, environment, source-site identity, or credentials.
Create your own deployment and preserve its identity when upgrading it. The
[manifest template](docs/examples/webflow.template.json) is provided for reference.

## What is included

- **CMS item snapshots:** captures supported webhook deliveries after setup;
  backfill supplies a current baseline for existing items.
- **Readable history:** ordinary saves group into editing sessions by default.
  Expand a session or enable **Show every captured edit** to inspect its versions.
- **Checkpoint policies:** site defaults, collection overrides, draft/archive
  transitions, watched fields, and entry into a custom field value.
- **Named checkpoints:** capture current Webflow item state or label a saved version.
- **Field-level diffs:** word-level text changes, sanitized rich-text rendering,
  and before/after values for other field types.
- **Restore:** stage an older version as draft, optionally publish that item,
  or recreate a deleted item as a new draft.
- **View live / View staging:** opens the item's published page on a connected
  domain or configured website base.
- **Delivery recovery:** durable inbox, duplicate-delivery protection, processing
  leases, source-time checks, and manual replay of pending/failed events.
- **Operations:** resumable backfills, paginated lists, and an optional authenticated
  endpoint for an external scheduler.

Checkpoint rules affect **history presentation**, not Webflow's save behavior.
They neither suppress ordinary content snapshots nor automatically publish items.
Webflow still sends site-wide CMS events; this app evaluates finer-grained rules.

## Deployment in brief

1. Click **Deploy to Webflow** to open the Cloud deployment flow for this example.
   For a separately editable repository, use GitHub's **Use this template** first.
2. Select your destination and review the repository/branch connection in Cloud.
3. Configure a source-site API token, source site ID, app password, and session secret.
4. Deploy through the connected GitHub branch and verify success in Cloud.
5. Sign in, run setup, backfill a test collection, and check a real test-item edit.

See [Installation](docs/installation.md) for prerequisites, exact configuration,
setup side effects, and an acceptance checklist. Normal releases use **GitHub
push-to-deploy**; a successful push is not itself proof that the Cloud build succeeded.

## Current boundaries

- History begins at successful capture. Backfill cannot recover revisions from
  before installation or reconstruct events that were never delivered.
- The app tracks CMS items only. Static-page history, Designer branches, and
  scheduled publishing are not implemented.
- Access uses a shared password. There are no individual users, roles, SSO,
  or reliable per-person change attribution. The activity feed is not an immutable
  compliance audit log.
- Staging links show content **published to the staging domain**, not unpublished
  drafts or the historical snapshot currently selected in the app.
- Secondary-locale webhooks are excluded. Deleted-item recovery assigns a new
  item ID and does not repair references to the old ID.
- Snapshots store field values, including asset URLs and reference IDs. They do
  not copy media files or back up the rest of the website.
- Restore detects changes before writing, but the Webflow API does not provide an
  atomic compare-and-swap across external edits. Review [restore behavior](docs/user-guide.md#restore-and-recover).
- No retention pruning, automatic full-site reconciliation, or external scheduler
  is provisioned by this repository. Plan capacity and test representative workloads;
  there is no verified 100k-item performance guarantee.

## Local checks

Node.js **24** is the tested local toolchain. Use the committed npm lockfile.

```bash
npm ci
npm test
npm run typecheck
npm run lint
```

Unit/integration tests use fake credentials and isolated local storage. See
[Development](docs/development.md) for app configuration, the Workers build,
and desktop/mobile browser smoke tests.

## Project layout

```text
src/app/          Next.js pages and API routes
src/components/   UI controls and diff rendering
src/lib/          Webflow client, snapshots, ingest, restore, policies, preview URLs
src/db/           D1 schema and versioned bootstrap/migrations
tests/            Isolated behavior tests and browser-smoke Worker configuration
scripts/          Local fixtures and local/production smoke checks
docs/             Installation, usage, operations, integration, and API guides
AGENTS.md         Repository instructions for coding agents
```

The [documentation index](docs/README.md) links the installation, integration,
operations, and agent handoff guides for this example.

## License

[MIT](LICENSE), Copyright (c) 2026 Webflow Examples. You may use, modify, and
redistribute this example under the license terms. Retain the copyright and license
notice. The software is provided as-is; review and test it for your own requirements.
