import { eq, desc } from "drizzle-orm";
import { getDb, getBindings, schema } from "@/db";
import { sha256Hex } from "./crypto";
import { withLock, type Lease } from "./locks";
import { getHistoryPolicy } from "./history-settings";
import { checkpointReason } from "./history-policy";

export interface SnapshotInput {
  itemId: string;
  collectionId: string;
  source: "webhook" | "backfill" | "restore" | "manual";
  triggerType?: string;
  fieldData: Record<string, unknown>;
  isDraft?: boolean;
  isArchived?: boolean;
  lastPublished?: string | null;
  actor?: string;
  name?: string;
  slug?: string;
  takenAt?: Date;
  sourceUpdatedAt?: Date;
  operationKey?: string;
  checkpoint?: string;
}

export interface SavedSnapshot {
  snapshotId: number | null; // null when deduped (state unchanged)
  contentHash: string;
  deduped: boolean;
  stale?: boolean;
  replayed?: boolean;
}

// Canonical JSON (sorted keys) so hashing is stable regardless of key order.
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

/**
 * Set or clear a snapshot's human-given name. Trims and caps length; an empty
 * string clears it back to null. Returns the stored value.
 */
export async function setSnapshotLabel(
  snapshotId: number,
  label: string,
): Promise<string | null> {
  const trimmed = label.trim().slice(0, 60);
  const value = trimmed.length ? trimmed : null;
  const db = await getDb();
  await db
    .update(schema.snapshots)
    .set({ label: value })
    .where(eq(schema.snapshots.id, snapshotId));
  return value;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return await new Response(stream).arrayBuffer();
}

export async function gunzip(buf: ArrayBuffer): Promise<string> {
  const stream = new Blob([buf])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

export function r2KeyFor(collectionId: string, itemId: string, hash: string) {
  return `snapshots/${collectionId}/${itemId}/${hash}.json.gz`;
}

/**
 * Persist an item state. Content-addressed: if the latest snapshot for this
 * item has the same hash, no new row/blob is written (deduped=true). The blob
 * itself is shared across snapshots via the hash-derived key either way.
 */
export async function saveSnapshot(input: SnapshotInput, lease?: Lease): Promise<SavedSnapshot> {
  if (!lease) return withLock(`item:${input.itemId}`, owned => saveSnapshot(input, owned));
  const db = await getDb();
  const env = await getBindings();
  const takenAt = input.takenAt ?? new Date();

  if (input.operationKey) {
    const [saved] = await db.select().from(schema.snapshots).where(eq(schema.snapshots.operationKey, input.operationKey)).limit(1);
    if (saved) return { snapshotId: saved.id, contentHash: saved.contentHash, deduped: true, replayed: true };
  }
  const [current] = await db.select().from(schema.items).where(eq(schema.items.id, input.itemId)).limit(1);
  const publishedTime = toDate(input.lastPublished);
  const sourceTime = input.sourceUpdatedAt && publishedTime
    ? new Date(Math.max(input.sourceUpdatedAt.getTime(), publishedTime.getTime())) : input.sourceUpdatedAt;
  const stale = Boolean(current && ((sourceTime && current.sourceUpdatedAt && sourceTime < current.sourceUpdatedAt) ||
      (current.deletedAt && input.source !== "restore" && (!sourceTime || sourceTime <= current.deletedAt))));
  const lifecycle = ["collection_item_published", "collection_item_unpublished"].includes(input.triggerType ?? "");
  if (stale && !lifecycle) {
    return { snapshotId: null, contentHash: "", deduped: true, stale: true };
  }

  const body = canonicalJson({
    fieldData: input.fieldData,
    isDraft: input.isDraft ?? current?.isDraft ?? null,
    isArchived: input.isArchived ?? current?.isArchived ?? null,
  });
  const contentHash = await sha256Hex(body);

  const itemWrite = db
    .insert(schema.items)
    .values({
      id: input.itemId,
      collectionId: input.collectionId,
      name: input.name ?? str(input.fieldData["name"]),
      slug: input.slug ?? str(input.fieldData["slug"]),
      isDraft: input.isDraft,
      isArchived: input.isArchived,
      lastPublishedAt: toDate(input.lastPublished),
      updatedAt: takenAt,
      sourceUpdatedAt: sourceTime,
      deletedAt: null,
    })
    .onConflictDoUpdate({
      target: schema.items.id,
      set: {
        name: input.name ?? str(input.fieldData["name"]),
        slug: input.slug ?? str(input.fieldData["slug"]),
        isDraft: input.isDraft,
        isArchived: input.isArchived,
        lastPublishedAt: toDate(input.lastPublished),
        updatedAt: takenAt,
        sourceUpdatedAt: sourceTime,
        deletedAt: null,
      },
    });

  const [latest] = await db
    .select()
    .from(schema.snapshots)
    .where(eq(schema.snapshots.itemId, input.itemId))
    .orderBy(desc(schema.snapshots.takenAt), desc(schema.snapshots.id))
    .limit(1);

  const previous = latest ? await loadSnapshotContent(latest.r2Key) : null;
  const policy = await getHistoryPolicy(input.collectionId);
  const checkpoint = input.checkpoint ?? checkpointReason(previous, {
    fieldData: input.fieldData, isDraft: input.isDraft, isArchived: input.isArchived,
  }, input.triggerType, policy);
  if (latest?.contentHash === contentHash && !checkpoint && !["restore", "manual"].includes(input.source)) {
    await lease.assertOwned();
    await itemWrite;
    return { snapshotId: latest.id, contentHash, deduped: true };
  }

  const r2Key = r2KeyFor(input.collectionId, input.itemId, contentHash);
  const existing = await env.SNAPSHOTS.head(r2Key);
  if (!existing) {
    await env.SNAPSHOTS.put(r2Key, await gzip(body), {
      httpMetadata: { contentType: "application/json", contentEncoding: "gzip" },
    });
  }

  await lease.assertOwned();
  const snapshotWrite = db
    .insert(schema.snapshots)
    .values({
      itemId: input.itemId,
      collectionId: input.collectionId,
      takenAt,
      source: input.source,
      triggerType: input.triggerType,
      contentHash,
      r2Key,
      actor: input.actor,
      isDraft: input.isDraft,
      lastPublishedAt: toDate(input.lastPublished),
      operationKey: input.operationKey,
      checkpoint,
    })
    .returning({ id: schema.snapshots.id });
  const [rows] = stale ? await db.batch([snapshotWrite]) : await db.batch([snapshotWrite, itemWrite]);

  return { snapshotId: rows[0].id, contentHash, deduped: false };
}

export interface SnapshotContent {
  fieldData: Record<string, unknown>;
  isDraft: boolean | null;
  isArchived: boolean | null;
}

export async function loadSnapshotContent(r2Key: string): Promise<SnapshotContent> {
  const env = await getBindings();
  const obj = await env.SNAPSHOTS.get(r2Key);
  if (!obj) throw new Error(`Snapshot blob missing: ${r2Key}`);
  return JSON.parse(await gunzip(await obj.arrayBuffer())) as SnapshotContent;
}

export async function recordEvent(input: {
  type: string;
  itemId?: string;
  collectionId?: string;
  snapshotId?: number | null;
  actor?: string;
  summary?: string;
  detail?: unknown;
  ts?: Date;
  eventKey?: string;
}): Promise<void> {
  const db = await getDb();
  await db.insert(schema.events).values({
    ts: input.ts ?? new Date(),
    type: input.type,
    itemId: input.itemId,
    collectionId: input.collectionId,
    snapshotId: input.snapshotId ?? undefined,
    actor: input.actor,
    summary: input.summary,
    detailJson: input.detail !== undefined ? JSON.stringify(input.detail) : undefined,
    eventKey: input.eventKey,
  }).onConflictDoNothing();
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function toDate(v: string | null | undefined): Date | null | undefined {
  if (v === null) return null;
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
