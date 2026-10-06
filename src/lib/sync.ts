import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getConfig } from "@/lib/env";
import { WebflowClient, CMS_ITEM_TRIGGERS } from "@/lib/webflow";
import { saveSnapshot, recordEvent } from "@/lib/snapshots";
import { withLock } from "@/lib/locks";

export async function syncCollections(): Promise<{ count: number }> {
  const { siteToken, siteId, apiBase } = await getConfig();
  const client = new WebflowClient(siteToken, apiBase);
  const db = await getDb();

  const { collections } = await client.listCollections(siteId);
  for (const c of collections) {
    // List response omits field definitions; fetch each collection for them
    const full = await client.getCollection(c.id);
    const values = {
      siteId,
      displayName: full.displayName,
      slug: full.slug,
      schemaJson: JSON.stringify(full.fields ?? []),
      lastSyncedAt: new Date(),
    };
    await db
      .insert(schema.collections)
      .values({ id: c.id, ...values })
      .onConflictDoUpdate({ target: schema.collections.id, set: values });
  }
  await recordEvent({
    type: "sync",
    summary: `Synced ${collections.length} collection(s)`,
  });
  return { count: collections.length };
}

/**
 * Self-healing ingest: webhooks are registered site-wide, so events arrive
 * for collections created after setup. On the first event from an unknown
 * collection, fetch its metadata and register it — otherwise it never shows
 * up in the UI until someone re-runs setup.
 */
export async function ensureCollectionSynced(collectionId: string): Promise<void> {
  const db = await getDb();
  const [existing] = await db
    .select({ id: schema.collections.id })
    .from(schema.collections)
    .where(eq(schema.collections.id, collectionId))
    .limit(1);
  if (existing) return;

  const { siteToken, siteId, apiBase } = await getConfig();
  const client = new WebflowClient(siteToken, apiBase);
  const full = await client.getCollection(collectionId);
  await db
    .insert(schema.collections)
    .values({
      id: collectionId,
      siteId,
      displayName: full.displayName,
      slug: full.slug,
      schemaJson: JSON.stringify(full.fields ?? []),
      lastSyncedAt: new Date(),
    })
    // A burst of events from the same new collection can race — first wins
    .onConflictDoNothing();
  await recordEvent({
    type: "sync",
    collectionId,
    summary: `Discovered new collection "${full.displayName}" via webhook`,
  });
}

export async function registerWebhooks(
  fallbackBaseUrl?: string,
): Promise<{ registered: string[]; skipped: string[] }> {
  const { siteToken, siteId, appUrl, apiBase } = await getConfig();
  const client = new WebflowClient(siteToken, apiBase);
  const db = await getDb();
  // APP_URL (explicit override) wins; otherwise use the base URL derived
  // from the request that triggered setup.
  const base = (appUrl ?? fallbackBaseUrl)?.replace(/\/$/, "");
  if (!base) {
    throw new Error(
      "Cannot determine the app's public URL — set APP_URL or run setup through the UI",
    );
  }
  const url = `${base}/api/webhooks/webflow`;

  const existing = await client.listWebhooks(siteId);
  const registered: string[] = [];
  const skipped: string[] = [];

  for (const trigger of CMS_ITEM_TRIGGERS) {
    const already = existing.webhooks.find(
      (w) => w.triggerType === trigger && w.url === url,
    );
    if (already) {
      const [local] = await db.select().from(schema.webhooks).where(eq(schema.webhooks.id, already.id));
      if (!local?.secret) throw new Error(`Webhook ${trigger} exists but its signing secret is missing. Remove that registration in Webflow and run setup again.`);
      skipped.push(trigger);
      continue;
    }
    const created = await client.createWebhook(siteId, trigger, url);
    await db
      .insert(schema.webhooks)
      .values({
        id: created.id,
        triggerType: trigger,
        url,
        // secretKey is only returned at creation time — persist it now or lose it
        secret: created.secretKey ?? null,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.webhooks.id,
        set: { secret: created.secretKey ?? null },
      });
    registered.push(trigger);
  }
  await recordEvent({
    type: "setup",
    summary: `Registered webhooks: ${registered.join(", ") || "none (all existed)"}`,
  });
  return { registered, skipped };
}

// --- Resumable backfill ---
// Each call processes a bounded number of pages inside the request time
// budget; the cursor in `jobs` lets the UI keep calling /continue until done.

const PAGES_PER_CALL = 3;
const PAGE_SIZE = 100;
const TIME_BUDGET_MS = 10_000;

export async function startBackfill(collectionId: string): Promise<number> {
  return withLock(`backfill-start:${collectionId}`, async () => {
  const db = await getDb();
  const all = await db.select().from(schema.jobs).where(eq(schema.jobs.collectionId, collectionId));
  const [collection] = await db.select().from(schema.collections).where(eq(schema.collections.id, collectionId));
  if (!collection) throw new Error("Sync this collection before starting a backfill");
  const resumable = all.find(j => j.status === "running" || j.status === "failed");
  if (resumable) {
    await db.update(schema.jobs).set({ status: "running", error: null }).where(eq(schema.jobs.id, resumable.id));
    return resumable.id;
  }
  const now = new Date();
  const [job] = await db
    .insert(schema.jobs)
    .values({
      kind: "backfill",
      collectionId,
      status: "running",
      cursor: 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.jobs.id });
  return job.id;
  });
}

export interface BackfillProgress {
  jobId: number;
  status: string;
  cursor: number;
  total: number | null;
  error?: string | null;
}

export async function continueBackfill(jobId: number): Promise<BackfillProgress> {
  return withLock(`backfill:${jobId}`, () => continueBackfillLocked(jobId));
}

async function continueBackfillLocked(jobId: number): Promise<BackfillProgress> {
  const db = await getDb();
  const [job] = await db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId))
    .limit(1);
  if (!job) throw new Error(`No such job ${jobId}`);
  if (job.status !== "running") {
    return { jobId, status: job.status, cursor: job.cursor, total: job.total, error: job.error };
  }

  const { siteToken, apiBase } = await getConfig();
  const client = new WebflowClient(siteToken, apiBase);
  const started = Date.now();
  let cursor = job.cursor;
  let total = job.total ?? null;

  try {
    for (let page = 0; page < PAGES_PER_CALL; page++) {
      if (Date.now() - started > TIME_BUDGET_MS) break;
      const res = await client.listItems(job.collectionId!, {
        offset: cursor,
        limit: PAGE_SIZE,
      });
      total = res.pagination.total;
      for (const item of res.items) {
        if (Date.now() - started > TIME_BUDGET_MS) break;
        await saveSnapshot({
          itemId: item.id,
          collectionId: job.collectionId!,
          source: "backfill",
          fieldData: item.fieldData,
          isDraft: item.isDraft,
          isArchived: item.isArchived,
          lastPublished: item.lastPublished,
          sourceUpdatedAt: item.lastUpdated ? new Date(item.lastUpdated) : undefined,
        });
        cursor++;
        // Cursor follows persisted items, not whole pages; interrupted batches resume safely.
        await db.update(schema.jobs).set({ cursor, total, updatedAt: new Date() }).where(eq(schema.jobs.id, jobId));
      }
      if (cursor >= total || res.items.length === 0) {
        await db
          .update(schema.jobs)
          .set({ status: "completed", cursor, total, updatedAt: new Date() })
          .where(eq(schema.jobs.id, jobId));
        await db
          .update(schema.collections)
          .set({ itemCount: total })
          .where(eq(schema.collections.id, job.collectionId!));
        await recordEvent({
          type: "backfill",
          collectionId: job.collectionId!,
          summary: `Backfill complete: ${cursor} item(s) snapshotted`,
        });
        return { jobId, status: "completed", cursor, total };
      }
    }
    await db
      .update(schema.jobs)
      .set({ cursor, total, updatedAt: new Date() })
      .where(eq(schema.jobs.id, jobId));
    return { jobId, status: "running", cursor, total };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.jobs)
      .set({ status: "failed", error: message, cursor, total, updatedAt: new Date() })
      .where(eq(schema.jobs.id, jobId));
    return { jobId, status: "failed", cursor, total, error: message };
  }
}
