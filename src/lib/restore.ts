import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getConfig } from "./env";
import { WebflowClient } from "./webflow";
import { loadSnapshotContent, saveSnapshot, recordEvent, canonicalJson } from "./snapshots";
import { withLock } from "./locks";
import { sha256Hex } from "./crypto";
import { assertPrimaryLocale } from "./ingest";

export interface RestoreResult { itemId: string; recreated: boolean; published: boolean }

export async function restoreSnapshot(snapshotId: number, mode: "draft" | "live", expectedHash: string, requestId = crypto.randomUUID()): Promise<RestoreResult> {
  const db = await getDb();
  const [snap] = await db.select().from(schema.snapshots).where(eq(schema.snapshots.id, snapshotId)).limit(1);
  if (!snap) throw new Error(`No such snapshot ${snapshotId}`);
  return withLock(`item:${snap.itemId}`, async lease => {
    const requestJson = JSON.stringify({ snapshotId, mode, expectedHash });
    const [prior] = await db.select().from(schema.restoreOperations).where(eq(schema.restoreOperations.id, requestId));
    if (prior) {
      if (prior.requestJson !== requestJson) throw new Error("Restore request id was already used for a different operation");
      if (prior.resultJson) return JSON.parse(prior.resultJson) as RestoreResult;
      throw new Error("This restore was already submitted and may have been applied. Inspect the item in Webflow and refresh history before starting another restore.");
    }
    const markSubmitted = () => db.insert(schema.restoreOperations).values({ id: requestId, requestJson, createdAt: new Date() });
    const content = await loadSnapshotContent(snap.r2Key);
    const { siteToken, apiBase } = await getConfig();
    const client = new WebflowClient(siteToken, apiBase);
    const [known] = await db.select().from(schema.items).where(eq(schema.items.id, snap.itemId)).limit(1);
    const collection = await client.getCollection(snap.collectionId);
    const writable = new Set((collection.fields ?? []).filter(f => f.isEditable !== false).map(f => f.slug));
    const unknown = Object.keys(content.fieldData).filter(k => !writable.has(k) && !["name", "slug"].includes(k));
    if (unknown.length) throw new Error(`Collection schema changed. Review these unavailable fields before restoring: ${unknown.join(", ")}`);
    for (const field of collection.fields ?? []) {
      if (field.isRequired && (content.fieldData[field.slug] == null || content.fieldData[field.slug] === ""))
        throw new Error(`The current schema requires ${field.displayName}; this version cannot be restored unchanged.`);
    }
    const operation = requestId;
    let targetItemId = snap.itemId;
    const recreated = Boolean(known?.deletedAt);
    let restored;
    if (recreated) {
      // Confirm deletion against the API: local webhook history can be delayed.
      try { await client.getItem(snap.collectionId, snap.itemId); throw new Error("Item exists again. Refresh history before recovering."); }
      catch (err) { if (!(err instanceof Error && "status" in err && err.status === 404)) throw err; }
      await lease.assertOwned();
      await markSubmitted();
      restored = await client.createItem(snap.collectionId, { isDraft: true, fieldData: content.fieldData });
      targetItemId = restored.id;
    } else {
      const current = await client.getItem(snap.collectionId, snap.itemId);
      await assertPrimaryLocale(current.cmsLocaleId);
      const currentHash = await sha256Hex(canonicalJson({ fieldData: current.fieldData, isDraft: current.isDraft, isArchived: current.isArchived }));
      const backup = await saveSnapshot({ itemId: current.id, collectionId: snap.collectionId, source: "manual",
        ...current, sourceUpdatedAt: current.lastUpdated ? new Date(current.lastUpdated) : undefined,
        checkpoint: "Before restore", operationKey: `${operation}:before` }, lease);
      if (!backup.snapshotId) throw new Error("A newer item state is already recorded. Refresh and retry after Webflow finishes processing.");
      if (currentHash !== expectedHash) throw new Error("The item changed since this page was loaded. Its current state is now backed up. Refresh and review before restoring.");
      if (mode === "live" && current.isArchived) throw new Error("This item is archived. Unarchive it in Webflow before publishing a restore.");
      await recordEvent({ type: "restore_started", itemId: snap.itemId, collectionId: snap.collectionId,
        summary: "Current state backed up; restore requested", detail: { snapshotId, operation, mode } });
      await lease.assertOwned();
      await markSubmitted();
      restored = await client.updateItem(snap.collectionId, snap.itemId, { isDraft: true, fieldData: content.fieldData });
    }
    // Persist the returned staged state before a separate publish can fail.
    const capture = (owned: typeof lease) => saveSnapshot({ itemId: targetItemId, collectionId: snap.collectionId, source: "restore",
      ...restored, sourceUpdatedAt: restored.lastUpdated ? new Date(restored.lastUpdated) : undefined,
      checkpoint: recreated ? "Recovered as draft" : "Restored as draft", operationKey: `${operation}:after` }, owned);
    const saved = recreated ? await withLock(`item:${targetItemId}`, capture) : await capture(lease);
    await recordEvent({ type: "restore", itemId: targetItemId, collectionId: snap.collectionId, snapshotId: saved.snapshotId,
      summary: recreated ? `Recovered as draft (new item id ${targetItemId})` : `Restored snapshot #${snapshotId} as draft`,
      detail: { fromSnapshotId: snapshotId, mode, operation, originalItemId: snap.itemId } });
    let published = false;
    if (mode === "live" && !recreated) {
      const result = await client.publishItems(snap.collectionId, [targetItemId]);
      if (result.errors?.length || !result.publishedItemIds?.includes(targetItemId))
        throw new Error("Content restored as draft, but Webflow did not confirm publication. Review the item before retrying publication.");
      published = true;
      await recordEvent({ type: "restore_published", itemId: targetItemId, collectionId: snap.collectionId,
        summary: "Restored content published; awaiting webhook state confirmation" });
    }
    const result = { itemId: targetItemId, recreated, published };
    await db.update(schema.restoreOperations).set({ resultJson: JSON.stringify(result) }).where(eq(schema.restoreOperations.id, requestId));
    return result;
  });
}
