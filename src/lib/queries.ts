import { desc, eq, isNull, like, sql, and, or } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * Tracked (non-deleted) items per collection. The `collections.item_count`
 * column only updates on sync, so prefer the live count once items exist.
 */
async function getTrackedItemCounts(db: Awaited<ReturnType<typeof getDb>>) {
  const rows = await db
    .select({
      collectionId: schema.items.collectionId,
      count: sql<number>`count(*)`,
    })
    .from(schema.items)
    .where(isNull(schema.items.deletedAt))
    .groupBy(schema.items.collectionId);
  return new Map(rows.map((r) => [r.collectionId, r.count]));
}

/** Sidebar data: every page renders the shell, so keep this lean. */
export async function getShellData() {
  const db = await getDb();
  const collections = await db
    .select({
      id: schema.collections.id,
      displayName: schema.collections.displayName,
      itemCount: schema.collections.itemCount,
      lastSyncedAt: schema.collections.lastSyncedAt,
    })
    .from(schema.collections)
    .orderBy(schema.collections.displayName);
  const [tracked, [webhookCount]] = await Promise.all([
    getTrackedItemCounts(db),
    db.select({ count: sql<number>`count(*)` }).from(schema.webhooks),
  ]);

  let lastSyncedAt: Date | null = null;
  for (const c of collections) {
    if (c.lastSyncedAt && (!lastSyncedAt || c.lastSyncedAt > lastSyncedAt)) {
      lastSyncedAt = c.lastSyncedAt;
    }
  }
  return {
    collections: collections.map((c) => ({
      ...c,
      itemCount: tracked.get(c.id) || c.itemCount,
    })),
    watching: (webhookCount?.count ?? 0) > 0,
    lastSyncedAt,
  };
}

export async function getDashboardData() {
  const db = await getDb();
  const collections = await db
    .select()
    .from(schema.collections)
    .orderBy(schema.collections.displayName);
  const [snapshotCounts, tracked, webhookCount] = await Promise.all([
    db
      .select({
        collectionId: schema.snapshots.collectionId,
        count: sql<number>`count(*)`,
      })
      .from(schema.snapshots)
      .groupBy(schema.snapshots.collectionId),
    getTrackedItemCounts(db),
    db.select({ count: sql<number>`count(*)` }).from(schema.webhooks),
  ]);

  const countMap = new Map(snapshotCounts.map((r) => [r.collectionId, r.count]));
  return {
    collections: collections.map((c) => ({
      ...c,
      itemCount: tracked.get(c.id) || c.itemCount,
      snapshotCount: countMap.get(c.id) ?? 0,
    })),
    webhooksRegistered: (webhookCount[0]?.count ?? 0) > 0,
  };
}

export async function getCollectionWithItems(collectionId: string, page = 1, search = "") {
  const db = await getDb();
  const [collection] = await db
    .select()
    .from(schema.collections)
    .where(eq(schema.collections.id, collectionId))
    .limit(1);
  if (!collection) return null;
  const filter = and(eq(schema.items.collectionId, collectionId), search
    ? or(like(schema.items.name, `%${search}%`), like(schema.items.slug, `%${search}%`)) : undefined);
  const [count] = await db.select({ total: sql<number>`count(*)` }).from(schema.items).where(filter);

  const snapshotCounts = db.$with("snapshot_counts").as(
    db
      .select({
        itemId: schema.snapshots.itemId,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(schema.snapshots)
      .where(eq(schema.snapshots.collectionId, collectionId))
      .groupBy(schema.snapshots.itemId),
  );
  const rows = await db
    .with(snapshotCounts)
    .select({
      item: schema.items,
      snapshotCount: sql<number>`coalesce(${snapshotCounts.count}, 0)`,
    })
    .from(schema.items)
    .leftJoin(snapshotCounts, eq(snapshotCounts.itemId, schema.items.id))
    .where(filter)
    .orderBy(desc(schema.items.updatedAt), schema.items.id)
    .limit(100).offset((page - 1) * 100);

  const items = rows.filter((r) => !r.item.deletedAt);
  const deletedItems = rows
    .filter((r) => r.item.deletedAt)
    .sort(
      (a, b) =>
        (b.item.deletedAt?.getTime() ?? 0) - (a.item.deletedAt?.getTime() ?? 0),
    );

  return { collection, items, deletedItems, total: count.total };
}

export async function getItemWithSnapshots(itemId: string, historyPage = 1) {
  const db = await getDb();
  const [item] = await db
    .select()
    .from(schema.items)
    .where(eq(schema.items.id, itemId))
    .limit(1);
  if (!item) return null;
  const [count] = await db.select({ total: sql<number>`count(*)` }).from(schema.snapshots).where(eq(schema.snapshots.itemId, itemId));
  const [collection] = await db
    .select()
    .from(schema.collections)
    .where(eq(schema.collections.id, item.collectionId))
    .limit(1);
  const snaps = await db
    .select()
    .from(schema.snapshots)
    .where(eq(schema.snapshots.itemId, itemId))
    .orderBy(desc(schema.snapshots.takenAt), desc(schema.snapshots.id))
    .limit(100).offset((historyPage - 1) * 100);
  const snapshots = snaps.map((s, i) => ({ ...s, version: count.total - (historyPage - 1) * 100 - i }));
  if (historyPage > 1) {
    const [latest] = await db.select().from(schema.snapshots).where(eq(schema.snapshots.itemId, itemId))
      .orderBy(desc(schema.snapshots.takenAt), desc(schema.snapshots.id)).limit(1);
    if (latest) snapshots.unshift({ ...latest, version: count.total });
  }
  return { item, collection: collection ?? null, snapshots, total: count.total };
}

export async function getSnapshotById(snapshotId: number) {
  const db = await getDb();
  const [snap] = await db
    .select()
    .from(schema.snapshots)
    .where(eq(schema.snapshots.id, snapshotId))
    .limit(1);
  return snap ?? null;
}

export interface EventRow {
  event: typeof schema.events.$inferSelect;
  itemName: string | null;
  collectionName: string | null;
}

/**
 * Audit events enriched with item/collection names for linking.
 * `type: "webhook"` groups all collection_item_* trigger types.
 */
export async function getEvents(
  opts: { type?: string; limit?: number } = {},
): Promise<EventRow[]> {
  const db = await getDb();
  const where =
    opts.type === "webhook"
      ? like(schema.events.type, "collection_item_%")
      : opts.type
        ? eq(schema.events.type, opts.type)
        : undefined;
  return db
    .select({
      event: schema.events,
      itemName: schema.items.name,
      collectionName: schema.collections.displayName,
    })
    .from(schema.events)
    .leftJoin(schema.items, eq(schema.events.itemId, schema.items.id))
    .leftJoin(
      schema.collections,
      eq(schema.events.collectionId, schema.collections.id),
    )
    .where(where)
    .orderBy(desc(schema.events.ts))
    .limit(opts.limit ?? 200);
}

/** Distinct filter keys for the activity chips, collapsed to the chip vocabulary. */
export async function getEventTypes(): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ type: schema.events.type })
    .from(schema.events);
  const present = new Set(
    rows.map((r) =>
      r.type.startsWith("collection_item_") ? "webhook" : r.type,
    ),
  );
  const known = ["webhook", "backfill", "restore", "setup", "sync"];
  return [
    ...known.filter((t) => present.has(t)),
    ...[...present].filter((t) => !known.includes(t)).sort(),
  ];
}
