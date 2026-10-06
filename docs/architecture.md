# Architecture and integration

[Documentation index](README.md) · [Application API](api.md)

## System boundary

This is a Next.js App Router app running in Webflow Cloud's Workers environment
through OpenNext. It talks to one Webflow CMS source site with a site API token.
It has no dependency on an MCP server, Designer bridge, or AI model at runtime.

```text
Webflow CMS events
    │ signed HTTP POST
    ▼
Webhook route: verify signature, validate payload and source site
    │
    ▼
D1 webhook_inbox: canonical payload identity + raw normalized body
    │ inline processing; failed entries remain available for replay
    ▼
Inbox/item leases → locale check → collection discovery / optional item fetch
    │
    ├── R2: content-addressed compressed JSON
    └── D1: item state + snapshot metadata + checkpoint reason + activity
                       │
                       ▼
Authenticated UI: grouped history, comparisons, checkpoint capture, restore

Optional external scheduler → authenticated job runner → replay + backfill progress
```

The app does not acknowledge every accepted event immediately and enqueue it on a
managed queue. Processing follows persistence within the request; a failure returns
503 so Webflow can retry. The external job runner is optional and separately configured.

## Source map

| Concern | Files |
|---|---|
| Config and mount handling | `src/lib/env.ts`, `src/lib/basePath.ts`, `next.config.ts` |
| Session gate | `src/middleware.ts`, `src/lib/session.ts`, `src/app/api/login/route.ts` |
| Webhook boundary | `src/app/api/webhooks/webflow/route.ts`, `src/lib/webhook-events.ts`, `src/lib/crypto.ts` |
| Processing / locale filter | `src/lib/ingest.ts` |
| Cross-isolate work leases | `src/lib/locks.ts` |
| Snapshot persistence / loading | `src/lib/snapshots.ts` |
| Checkpoint policy / grouping | `src/lib/history-policy.ts`, `src/lib/history-settings.ts` |
| Restore / recovery journal | `src/lib/restore.ts` |
| Setup / collection sync / backfill | `src/lib/sync.ts` |
| Data API transport | `src/lib/webflow.ts` |
| Preview domain discovery / URL validation | `src/lib/item-previews.ts`, `src/lib/preview-urls.ts` |
| Queries / diffs / formatting | `src/lib/queries.ts`, `src/lib/diff.ts`, `src/lib/format.ts` |
| Database definition / migration | `src/db/schema.ts`, `src/db/bootstrap.sql.ts`, `src/db/index.ts` |
| Browser controls | `src/components/` |

## Storage model

| Table / resource | Responsibility |
|---|---|
| `collections` | Source collection identity, URL slug, latest synced field schema |
| `items` | Latest known state, source timestamp, deletion marker; keyed by item ID |
| `snapshots` | Capture time/source, content hash, R2 key, label, checkpoint reason, optional operation key |
| `events` | Meaningful content/app operations with optional unique event key |
| `webhooks` | Remote registration IDs, callback URLs, signing secrets |
| `webhook_inbox` | Delivery identity, normalized payload, processing status, attempts, errors |
| `history_settings` | Site policy (`scope = site`) and collection overrides |
| `work_locks` | Expiring D1 ownership leases for inbox/item/backfill work |
| `restore_operations` | Request identity, submitted intent, and completed result |
| `jobs` | Backfill cursor, status, totals, and failure information |
| `schedules` | Reserved schema only; no scheduled-publishing executor or UI |
| R2 `snapshots/<collectionId>/<itemId>/<hash>.json.gz` | Full field data plus draft/archive flags |

The schema version is recorded in `schema_meta`. Fresh installs use
`BOOTSTRAP_STATEMENTS`; existing installs apply newer `MIGRATIONS`. Change both
the fresh schema and an additive migration when extending it. Do not edit an
already-deployed migration to introduce a new column.

## Guarantees and boundaries to preserve

### Capture and ordering

- Delivery identity is the SHA-256 of canonical JSON for the whole parsed webhook
  body, not a provider-supplied delivery UUID. Identical payloads are idempotent.
- Snapshot content hashes cover field data and draft/archive flags. Timestamps are
  metadata; publication milestones can reference the same blob as a prior version.
- Leases serialize item writes within this app. R2 is written before the D1 snapshot
  and current-state batch. R2 and D1 are not one distributed transaction; an interrupted
  write can leave an unused blob.
- Source timestamps prevent older observed state from replacing newer state. Missing
  source time falls back to receipt time; this is not a perfect source event sequence.
  Late publish/unpublish milestones are retained without advancing newer item state.
- If a webhook omits field data, the processor fetches current item state. That read
  cannot reconstruct content as it existed at a past event.
- Secondary CMS locales are explicitly excluded when their ID is present. Missing
  locale IDs are treated as primary. Full locale support requires changing identity,
  queries, blob keys, backfill, and restore together.

### Checkpoints and display

Policy evaluation compares previous captured content with incoming content. It stores
one checkpoint reason; grouping is a separate render-time operation. A first observed
state is a baseline. "Ready to publish" describes a draft-flag transition; it is not
proof of publication or an approval workflow.

Timeline grouping is limited to loaded rows; pagination can split an editing session.
Version numbers are display ordinals, not durable identifiers. Use snapshot IDs for
actions and links. Reference fields are retained as their stored values/IDs, not a
historical graph of all referenced content.

### Restore

Restore validates current schema compatibility, captures the actual current state,
checks the caller's expected hash, and journals intent before the external write.
An uncertain submitted request must not be automatically executed again. The same
completed request can return its recorded result. This is application-level replay
protection, not an atomic transaction with Webflow.

Live restore is two operations: stage as draft, then publish the item. Both provider
HTTP status and item-level publish results matter. Recovery creates a new draft ID;
it does not repair references or restore deleted assets.

### Authentication

The UI and ordinary mutation routes share a signed-cookie gate. Only login,
signed-webhook ingress, and the independently bearer-authenticated job runner are
public middleware paths. Do not expose replay/restore through an unauthenticated
route when reusing these modules. A Webflow API token is not an app-session credential.

## Integrate into an existing app

**Lowest-friction option:** deploy this example as a separate Cloud app on an available
mount and link to it from your existing project. This avoids route, schema, and
authentication collisions while still tracking that project's CMS.

For an embedded integration, treat this repository as application source rather
than a drop-in package:

1. **Inventory the target.** Confirm Next.js/App Router and OpenNext compatibility,
   source site, mount/basePath, auth, routes, storage, and existing database schema.
   Keep the target's Git remote and Cloud identity.
2. **Allocate storage deliberately.** The code expects `DB`, `CACHE`, and `SNAPSHOTS`.
   Generic tables such as `items`, `events`, and `jobs` can collide with another app.
   Prefer a dedicated D1 binding; adapt `src/db/index.ts` and binding types to its
   name. Never run this bootstrap over an unrelated database without reviewing it.
3. **Bring the server modules together.** Capture, locks, migrations, restore,
   schema sync, and configuration are interdependent. Copying `saveSnapshot()` alone
   does not provide the delivery and restore safeguards.
4. **Merge routes and authentication.** Choose an app namespace, reconcile API paths,
   and preserve the signed-webhook/job-runner boundaries. Do not overwrite the target's
   middleware or user auth with the shared-password gate. Apply target authorization
   to every action, especially restore/publish and replay.
5. **Merge UI and styles.** The current UI uses Tailwind v4 tokens from
   `src/app/globals.css`, typography in the root layout, and `@/` imports. Review collisions rather
   than replacing the target's global CSS, aliases, layouts, or package manifest.
6. **Adapt external URLs.** Webhook callbacks use the app base plus its ingress route.
   Item preview links use website domains and CMS paths, independent of the app mount.
7. **Validate in isolation.** Run behavior tests against isolated bindings, then use a
   disposable CMS test item to verify real delivery and a deliberately authorized restore.
8. **Deploy via the target's workflow.** Register callbacks only after the destination
   is reachable, backfill its baseline, and record the final commit/environment in the handoff.

Adding this to a non-Next.js/non-Workers host also requires storage, compression,
WebCrypto, request lifecycle, and auth adapters. Do not assume the Cloud-specific
bindings or middleware execute unchanged on a generic Node server or in Designer custom code.
