# Application API

[Documentation index](README.md) · [Architecture](architecture.md)

These are the app's current internal HTTP routes, not the Webflow Data API and not
a versioned public SDK. Payloads below describe the current code. The UI is the
primary client; there is no general JSON read/export API for history.

All paths are relative to the **app base**. At `/app`, `/api/restore` becomes
`https://YOUR_HOST/app/api/restore`. In browser code use `apiPath()`; Next.js router
base-path handling does not automatically prefix plain `fetch()` URLs.

## Authentication boundaries

| Boundary | Authentication |
|---|---|
| App pages and ordinary APIs | Signed `cms_tools_session` cookie |
| `POST /api/login` | JSON password; establishes the session |
| `POST /api/webhooks/webflow` | Webflow HMAC signature plus timestamp, then source-site validation |
| `POST /api/jobs/run` | `Authorization: Bearer <JOBS_SECRET>` |

Session lifetime is 12 hours. Cookies are HttpOnly, Secure, and SameSite=Lax. Every
signed-in user has the same permissions. A site API token cannot replace the app
cookie, and `JOBS_SECRET` cannot call restore or settings routes.

## Route reference

Unless noted otherwise, send `Content-Type: application/json` and the session cookie.
IDs must be discovered from this installation; do not reuse IDs from sample data or
another site.

| Method / route | Request body | Behavior / main response |
|---|---|---|
| `POST /api/login` | `{ "password": "…" }` | Sets session cookie; `{ "ok": true }`; wrong password 401 |
| `POST /api/logout` | None | Clears session cookie |
| `POST /api/setup` | None | Syncs collections and registers five callbacks; `{ ok, collections, webhooks }` |
| `POST /api/sync` | None | Refreshes collection metadata; does not backfill items |
| `POST /api/backfill` | `{ "collectionId": "…" }` | Starts/resumes a job and runs a chunk; progress object |
| `POST /api/backfill/continue` | `{ "jobId": 1 }` | Advances a running job; progress object |
| `POST /api/checkpoints` | `{ "itemId": "…", "label": "Launch", "requestId": "<UUID>" }` | Reads current Webflow item and captures a named checkpoint; `{ ok, snapshotId }` |
| `POST /api/snapshots/label` | `{ "snapshotId": 1, "label": "Launch" }` | Labels a captured version; empty string clears; `{ ok, label }` |
| `POST /api/history-settings` | `{ "scope": "site-or-collection-id", "policy": {…} }` | Saves a complete policy; `{ ok: true }` |
| `POST /api/restore` | See below | Writes to Webflow; `{ ok, itemId, recreated, published }` |
| `POST /api/inbox/replay` | None | Processes a bounded pending/failed batch; `{ attempted, completed }` |
| `POST /api/jobs/run` | None; bearer auth | Replay plus optional backfill progress; `{ replay, backfill }` |
| `POST /api/webhooks/webflow` | Provider CMS event; HMAC auth | Durable ingest and inline processing; `{ ok: true }` on success |

Error envelopes are not uniform across all routes: check HTTP status and any `ok`,
`error`, or job `status` fields. In particular a failed backfill can return HTTP 200
with `status: "failed"`, and a scheduler's 200 does not certify all queued work succeeded.

### Backfill progress

```json
{
  "jobId": 1,
  "status": "running",
  "cursor": 100,
  "total": 500,
  "error": null
}
```

Continue while `status` is `running`. Clicking Backfill/Retry resumes a failed job
through `/api/backfill`; `/api/backfill/continue` does not restart a failed job.

### Checkpoint policy

The current default policy is:

```json
{
  "mode": "smart",
  "sessionMinutes": 5,
  "transitions": true,
  "watchedFields": [],
  "customField": "",
  "customValue": ""
}
```

Modes: `smart`, `all`, `milestones`. Session minutes: integer 1–60. Up to 50 watched
field slugs; each at most 100 characters. Custom field: at most 100 characters;
target value: at most 200. Send the full policy, not a partial patch.

Use `scope: "site"` for the default or a synced collection ID for an override.
`policy: null` removes a collection override; it does not clear the site default.

### Restore request and replay identity

Request shape (illustrative placeholders):

```json
{
  "snapshotId": 42,
  "mode": "draft",
  "expectedHash": "<64-character lowercase SHA-256 of the current captured state>",
  "requestId": "<UUID generated once for this intended operation>"
}
```

- `snapshotId` identifies the historical target. `expectedHash` is the current
  state the user reviewed, **not** the target version's hash.
- `mode` is `draft` or `live`. Recovery of a deleted item still creates a new draft.
- Reuse `requestId` for a retry of the same operation and payload. Do not mint a
  fresh ID to bypass an uncertain-outcome response.
- A completed journal entry returns its stored result. A submitted request without
  a completed result requires inspection/reconciliation before a new operation.
- There is no dedicated read endpoint for `expectedHash`; the server-rendered UI
  obtains it from snapshot metadata. An embedded integration must preserve that
  reviewed-state context.

Manual checkpoints also take a request UUID for replay protection. Use a stable UUID
for a retry of the same item/name capture; generate a new one for a new intended capture.

## Webhook contract

The app accepts the five `collection_item_*` triggers in `CMS_ITEM_TRIGGERS`:
created, changed, deleted, published, and unpublished.

- Required envelope: `triggerType` plus an object `payload`.
- Required payload identifiers: `id`, `collectionId`, `siteId`.
- Optional `isDraft`/`isArchived` values must be booleans when provided.
- `fieldData`, when supplied, must be an object; otherwise processing fetches the item.
- `cmsLocaleId`, source timestamps, and publication metadata guide filtering/ordering.

Signature validation uses the **raw request body** and
`HMAC-SHA256(secret, timestamp + ":" + rawBody)`, compared with
`x-webflow-signature`. `x-webflow-timestamp` is checked within a five-minute window.
Use the per-registration secret saved by setup. Do not reserialize the body before
signature verification or substitute the site token as the signing key.

See [Operations](operations.md#how-webhook-failure-recovery-works) for response codes
and retry semantics, and the official
[Webflow webhook guide](https://developers.webflow.com/data/docs/working-with-webhooks)
for provider behavior.
