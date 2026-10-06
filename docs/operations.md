# Operations and troubleshooting

[Documentation index](README.md) · [Application API](api.md)

## Routine checks

- Verify the active Cloud deployment's commit SHA and status after a release.
- Review inbox failures in **History & health** and confirm recent edits are arriving.
- Inspect backfill progress and storage consumption for the actual workload.
- Keep D1 and R2 backups together; record the source site and schema version.
- If a scheduler is configured, verify its request history and the app's last tick.

The app has no automatic retention pruning, archival export UI, or scheduled
full-site reconciliation. Large histories, raw inbox payloads, and logs consume
storage until an operator implements a retention process. Do not delete a shared
R2 blob merely because one snapshot row is removed; multiple rows can reference it.

## How webhook failure recovery works

The request path is **verify → persist inbox → process inline → respond**. It is not
an immediate acknowledgement followed by a provisioned background queue.

| Result | App response / behavior |
|---|---|
| Invalid signature or no usable stored key | 401; not accepted into the inbox |
| Invalid/unsupported CMS payload | 400; not accepted |
| Source site does not match configuration | 403; not accepted |
| Capture and processing succeed | 200; inbox entry completed |
| Exact delivery is already completed | 200; no repeated side effects |
| Known secondary-locale event | 200; recorded as ignored |
| Processing/storage failure or busy processing lease | 503; requests upstream retry; any successfully persisted entry remains replayable |

Webflow documents limited retries for non-200 responses, not indefinite delivery.
See [Webflow webhook behavior](https://developers.webflow.com/data/docs/working-with-webhooks).
If inbox persistence itself fails, no local entry is guaranteed; recovery then
depends on an upstream retry or a later current-state backfill.

**Retry pending events** processes a bounded batch. Persistent failures can recur;
fix the cause, then retry. The UI is a recent-failure view, not a raw payload browser.
Raw payloads are in D1's `webhook_inbox.body` for authorized investigation and may
contain unpublished content.

## External scheduler

The application exposes a job runner; deploying the repo does not create a cron job.

1. Set a dedicated random `JOBS_SECRET` in the target Cloud environment.
2. Configure an external scheduler to send an HTTPS **POST** every minute to your
   full app base plus `/api/jobs/run`.
3. Set the request header `Authorization: Bearer <JOBS_SECRET>` through the scheduler's
   secret store. Do not put the token in the URL or source control.
4. Confirm 200 responses and a recent **Last scheduler tick** in History & health.

Manual invocation, with the secret already supplied securely to the shell environment:

```bash
APP_BASE='https://your-host.webflow.io/app'
curl --fail-with-body --silent --show-error --max-time 25 \
  --request POST \
  --header "Authorization: Bearer ${JOBS_SECRET}" \
  "${APP_BASE}/api/jobs/run"
```

An example successful response shape:

```json
{ "replay": { "attempted": 2, "completed": 2 }, "backfill": null }
```

The runner selects up to ten pending/failed inbox entries, stopping further work
after its processing-loop time budget. `attempted` is the number selected, not an
exact count of attempted executions when the budget interrupts the batch. If enough
time remains, it advances one `running` backfill job. It then records the tick in KV.

A tick does not mean every job succeeded. A busy/failing inbox can delay backfills;
there is no fair queue, exponential backoff, or automatic dead-letter eviction.
Failed backfills require Backfill/Retry to return to `running`. Do not point multiple
schedulers at the same environment unnecessarily; leases prevent overlapping item
work but the runner is not a global rate limiter.

## Common issues

### Sign-in fails or loops

- Verify the password on the correct Cloud environment, not the local `.dev.vars`.
- A 500 naming a missing variable can occur because sign-in validates all four
  required app variables, including the source-site token and ID.
- Verify the app mount and API URL. A Cloud app at `/app` uses `/app/api/login`.
- Use HTTPS in production. The session cookie is Secure.
- Rotating `APP_PASSWORD` alone does not invalidate existing sessions; rotate
  `SESSION_SECRET` when that is required. Sessions otherwise expire after 12 hours.

### Setup reports a missing signing key

Webflow returns site-token webhook secrets at creation. An existing registration
without the corresponding local secret cannot be repaired by listing webhooks.
Confirm the exact source site, trigger, and callback URL. Remove only the affected
registration through Webflow/API, then rerun setup to recreate it with a stored key.
Deleting registrations affects delivery; do not delete another environment's hooks.

OAuth-created or dashboard-created webhooks are not substitutes for this app's
site-token registration flow.

### Edits are not appearing

1. Check that setup completed and all five trigger keys are present.
2. Check the callback includes the correct hostname and mount and has no redirects.
3. Check `WEBFLOW_SITE_ID` matches the event source, and `WEBFLOW_API_BASE` is unset
   outside local testing.
4. Check inbox failures, ignored locales, and Cloud runtime errors.
5. Retry after correcting the cause, then refresh the item screen.

If a delivery never reached the inbox, backfill can recover the current state only,
not missing intermediate revisions or a deleted item that was never captured.

### Backfill stops, times out, or receives 429

Each call processes bounded work and persists an item-by-item cursor. Without an
external scheduler, the browser drives continuation; closing it pauses further calls.
Click Backfill again to resume a running/failed job's cursor.

API calls have short timeouts and do not sleep/retry 429s inside a request. Respect
the provider's retry guidance before resuming. The client concurrency limit is per
instance, not a site-wide/token-wide limiter. Offset pagination can move under concurrent
item creation/deletion; a quiet baseline window and a later fresh backfill help, but
there is no point-in-time full-site backup guarantee.

### Restore failed or has an uncertain outcome

- **Changed since page load:** the current state was captured; refresh, review, and
  deliberately choose the restore again.
- **Schema mismatch:** inspect the current fields and selected snapshot. The app does
  not silently drop incompatible fields or migrate their types.
- **Draft restored, publish not confirmed:** inspect the draft and published item in
  Webflow before trying to publish again.
- **Already submitted / uncertain result:** inspect Webflow and Activity first. The
  restore journal intentionally blocks automatic repetition of an operation that
  may already have written data. Reconcile the outcome before creating a fresh request.
- **Recovery returns a new item ID:** repair inbound references manually if needed.

Do not clear `restore_operations` or `work_locks` just to make a retry succeed.
Locks expire after two minutes if their owner cannot release them; journal entries
protect against duplicate external writes.

### Preview links are missing or return 404

Check [Configuration](configuration.md#automatic-preview-discovery). Domain discovery
requires `sites:read`. Explicit website bases can be used if discovery is unavailable.
A link can still 404 if the item/slug/template is not published to that domain, or
custom routing differs from the stored collection path. Selecting a historical
snapshot does not change the preview link to that historical slug.

## Backups, upgrades, and rollback

- Back up D1 and R2 using the provider tools available to your environment. Include
  snapshot metadata and the blobs it references. Protect D1 exports: they contain
  webhook signing secrets and may contain draft content.
- Record the app commit SHA, schema version, binding identity, source site, and
  mount with the backup. A copied DB alone cannot load missing blobs.
- Review new `MIGRATIONS` entries before upgrading an existing installation.
  The app runs them lazily on first database access; normal code deploys do not
  back up the database or roll data back for you.
- Validate an upgrade with a separate test environment before production. Isolated
  Cloud environments need their own configuration and baseline.
- Rolling application code back does not undo CMS writes, database migrations, or
  R2 changes. Check compatibility with the current schema before selecting an older
  commit. Preserve bindings and history during rollback.

## Move or retire an installation

Changing the app URL/source site is a migration, not just a cosmetic setting change.
Inventory this installation's webhook registrations first. Setup creates callbacks
for its current URL but does not remove old ones. Back up history, update the intended
environment, verify the new callback, and remove obsolete registrations deliberately.

Do not retarget an existing populated DB to a different source site. Use separate
bindings/environment and establish a new baseline. Before deleting an app/environment,
export any required history and remove only its callbacks; storage deletion can be irreversible.
