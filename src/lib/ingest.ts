import { eq, inArray, asc, sql } from "drizzle-orm";
import { getDb, getBindings, schema } from "@/db";
import { getConfig } from "./env";
import { WebflowClient } from "./webflow";
import { ensureCollectionSynced } from "./sync";
import { saveSnapshot, recordEvent } from "./snapshots";
import { withLock } from "./locks";
import { parseWebhook, eventTime } from "./webhook-events";

/** First release is primary-locale only: never mix localized content into primary history. */
export async function assertPrimaryLocale(locale: unknown) {
  if (locale == null) return;
  const { CACHE } = await getBindings();
  const config = await getConfig();
  const key = `primary-locale:${config.siteId}`;
  let primary = await CACHE.get(key);
  if (!primary) {
    const site = await new WebflowClient(config.siteToken, config.apiBase).getSite(config.siteId);
    primary = site.locales?.primary?.cmsLocaleId ?? null;
    if (!primary) throw new Error("Cannot verify the site's primary CMS locale");
    await CACHE.put(key, primary, { expirationTtl: 3600 });
  }
  if (locale !== primary) throw new SecondaryLocaleError("Secondary locale excluded: this release tracks the primary locale only");
}
class SecondaryLocaleError extends Error {}

export async function processInboxEvent(id: string) {
  return withLock(`inbox:${id}`, async () => {
    const db = await getDb();
    const [entry] = await db.select().from(schema.webhookInbox).where(eq(schema.webhookInbox.id, id));
    if (!entry || ["completed", "ignored"].includes(entry.status)) return;
    await db.update(schema.webhookInbox).set({ attempts: sql`${schema.webhookInbox.attempts} + 1`, status: "pending", error: null }).where(eq(schema.webhookInbox.id, id));
    try {
      const body = parseWebhook(entry.body);
      const { payload: p, triggerType } = body;
      await assertPrimaryLocale(p.cmsLocaleId);
      const itemId = p.id as string;
      const collectionId = p.collectionId as string;
      const occurredAt = eventTime(body, entry.receivedAt);
      await withLock(`item:${itemId}`, async lease => {
        if (triggerType === "collection_item_deleted") {
          const [current] = await db.select().from(schema.items).where(eq(schema.items.id, itemId));
          if (current?.sourceUpdatedAt && current.sourceUpdatedAt > occurredAt) return;
          await lease.assertOwned();
          await db.update(schema.items).set({ deletedAt: occurredAt, sourceUpdatedAt: occurredAt }).where(eq(schema.items.id, itemId));
          await recordEvent({ type: triggerType, itemId, collectionId, ts: occurredAt, eventKey: id, summary: "Item deleted — available snapshots retained" });
          return;
        }
        await ensureCollectionSynced(collectionId);
        let fieldData = p.fieldData as Record<string, unknown> | undefined;
        let isDraft = p.isDraft as boolean | undefined;
        let isArchived = p.isArchived as boolean | undefined;
        let lastPublished = p.lastPublished as string | null | undefined;
        let sourceUpdatedAt = occurredAt;
        if (!fieldData) {
          const c = await getConfig();
          const item = await new WebflowClient(c.siteToken, c.apiBase).getItem(collectionId, itemId);
          await assertPrimaryLocale(item.cmsLocaleId);
          ({ fieldData, isDraft, isArchived, lastPublished } = item);
          sourceUpdatedAt = item.lastUpdated ? new Date(item.lastUpdated) : occurredAt;
        }
        const saved = await saveSnapshot({ itemId, collectionId, source: "webhook", triggerType,
          fieldData, isDraft, isArchived, lastPublished, sourceUpdatedAt, takenAt: occurredAt, operationKey: id }, lease);
        if (!saved.deduped || saved.replayed) await recordEvent({ type: triggerType, itemId, collectionId,
          snapshotId: saved.snapshotId, ts: occurredAt, eventKey: id,
          summary: triggerType.replace("collection_item_", "Item ") });
      });
      await db.update(schema.webhookInbox).set({ status: "completed", completedAt: new Date(), error: null }).where(eq(schema.webhookInbox.id, id));
    } catch (err) {
      const ignored = err instanceof SecondaryLocaleError;
      await db.update(schema.webhookInbox).set({ status: ignored ? "ignored" : "failed", error: err instanceof Error ? err.message : "Processing failed" }).where(eq(schema.webhookInbox.id, id));
      if (!ignored) throw err;
    }
  });
}

export async function replayInbox() {
  const db = await getDb();
  const entries = await db.select({ id: schema.webhookInbox.id }).from(schema.webhookInbox)
    .where(inArray(schema.webhookInbox.status, ["pending", "failed"])).orderBy(asc(schema.webhookInbox.receivedAt)).limit(10);
  const start = Date.now();
  let completed = 0;
  for (const entry of entries) {
    if (Date.now() - start > 7_000) break;
    try { await processInboxEvent(entry.id); completed++; } catch { /* visible in the inbox */ }
  }
  return { attempted: entries.length, completed };
}
