# Using the CMS Version History example

[Documentation index](README.md)

## Overview and collection lists

The overview lists collections already synced into the app. **Run setup** performs
the initial schema sync and webhook registration. **Sync collections** refreshes
collection names, URL slugs, and field definitions without performing a backfill.

**Backfill** captures the current staged state of existing items. It is a baseline,
not an import of Webflow's past edits. Collections created later are discovered on
their first supported non-delete item event, or when you sync again.

Collection search uses the server and matches names/slugs. Lists show batches of
100 matching items, including deleted items; use the pagination controls to continue.

## Review an item

Open an item to see its latest known status, captured versions, and field diffs.

- Click an older version to compare it with the latest captured version.
- Click the latest version to see its complete captured state.
- **Swap** reverses the comparison's before/after direction.
- **Newer / Older** pages through history. Older pages keep the latest version
  available as a comparison target.
- Refresh after a Webflow edit to load new captures. The page is not a live event stream.

"Latest" means the newest state captured by this app. It can lag Webflow if delivery
or processing has failed. Before a restore, the backend reads the actual current
Webflow item and compares its content hash.

## Checkpoints and grouped history

**Save checkpoint** is the blue button in the item header. Enter a name and choose
**Capture current state**. It reads the current item from Webflow and records a
checkpoint; it does not change or publish the item.

You can also name an existing version from the timeline. Naming an old version does
not fetch current content. An empty name clears the label; names are limited to
60 characters.

In **History & health**, configure a site default or choose a collection override:

| Setting | Behavior |
|---|---|
| Smart checkpoints | Groups neighboring ordinary edits into sessions; default five-minute gap |
| Every change | Displays each captured version separately |
| Milestones and latest state | Shows prominent checkpoints plus the latest state |
| Session window | A 1–60 minute gap between neighboring edits; not a maximum total session duration |
| Draft/archive transitions | Marks observed changes in these flags as checkpoints |
| Watched fields | Marks a change to any specified field slug as a checkpoint |
| Custom field / target value | Marks entry into the specified stored value |
| Use site defaults | Removes a collection override |

Example: set custom field `review-status` and target value `approved` for a plain-text
workflow field. The transition fires when the value **becomes** `approved`, not on
every later save while it stays approved. For a Webflow Option field, use the stored
option ID from its schema, not the option's display name.

Publish, unpublish, restore, manual, and named checkpoints stay prominent. When several
rules match one event, the current implementation stores one reason in this priority:
publish/unpublish, baseline, archive transition, draft transition, custom value, watched fields.

Grouping changes the view, not stored content or webhook subscriptions. The mode and
session window apply when history is rendered. Transition/field rules label future
captures; changing them does not relabel old versions. **Show every captured edit**
overrides the view for the loaded history page.

## View live and staging

**View live** and **View staging** open the item's published page in a new tab.
They use its latest known slug, even when an old snapshot is selected.

- Staging is the website published to `webflow.io` or the configured staging base.
- A saved draft or an unpublished slug change may not resolve on either domain.
- Archived/deleted items may no longer have a published page.
- A collection needs a published template page to have a useful item URL.
- Multiple production domains produce a chooser. Missing/invalid domain configuration
  is explained beneath the links.

These links do not preview a historical snapshot. See
[preview configuration](configuration.md#automatic-preview-discovery) for overrides.

## Restore and recover

### Restore an existing item

The restore target is the **base version** of the displayed comparison; check its
version label before confirming.

1. Select the desired version and review the differences.
2. Choose **Restore as draft** or **Restore + publish**.
3. Confirm the operation.

The server checks the current collection schema, reads the current item, and saves a
**Before restore** checkpoint. If its hash differs from the state the page supplied,
the operation stops and asks you to refresh and review. Otherwise it stages the
selected field values as a draft.

- Draft restore does not unpublish an already-live item or immediately replace its
  live content. Normal Webflow publishing still controls that content.
- Live restore additionally requests publication of that item and checks the response.
- Archive state is not replayed from the old version. An existing archived item must
  be unarchived in Webflow before a live restore.
- Unavailable/non-editable fields and missing required values can block restore.
  Other validation failures are reported by Webflow; field values are not auto-converted.
- The API has no atomic conditional write here. Another editor can still change the
  item between the read/check and write. Coordinate restores on actively edited items.

If publication fails, the draft restore may already have succeeded. The error states
that publication was not confirmed. Inspect the item before requesting another action.

Restore requests have an idempotency journal. A repeat of a completed request returns
the recorded result. A request with an uncertain post-submission outcome is blocked
from automatic re-execution. Follow [Operations](operations.md#restore-failed-or-has-an-uncertain-outcome)
instead of repeatedly clicking restore.

### Recover a deleted item

Open it from the deleted-items section and choose **Recover**. Recovery requires an
existing captured snapshot, confirms the original ID is absent, and creates a new
draft in Webflow. The new item has a **new ID**. Existing references to the old ID
are not repaired, and recovery does not publish the new item automatically.

Deleted media or referenced items are not restored by recovering this item. Snapshot
field data may still point to those missing resources.

## Activity and health

**Activity** shows meaningful CMS changes and app operations. Unchanged content
deliveries and duplicate retries do not each create another activity row. The feed
is capped at the latest 200 matching events; it is not an export of all stored history.

**History & health** shows inbox counts, up to 20 recent pending/failed/ignored
entries, stored webhook-key coverage, and the last scheduler tick. A stored key means
the app has registration data, not that Webflow is currently delivering events.
Use [Operations](operations.md) to investigate failures or stalled work.
