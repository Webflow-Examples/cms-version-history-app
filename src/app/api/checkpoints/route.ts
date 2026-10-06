import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getConfig } from "@/lib/env";
import { WebflowClient } from "@/lib/webflow";
import { saveSnapshot, setSnapshotLabel, recordEvent } from "@/lib/snapshots";
import { withLock } from "@/lib/locks";
import { assertPrimaryLocale } from "@/lib/ingest";

export async function POST(request: NextRequest) {
  try {
    const { itemId, label, requestId } = await request.json() as Record<string, unknown>;
    if (typeof itemId !== "string" || typeof label !== "string" || !label.trim() || label.length > 60 ||
      typeof requestId !== "string" || !/^[a-f0-9-]{36}$/.test(requestId)) throw new Error("A checkpoint name and request id are required");
    const db = await getDb();
    const [tracked] = await db.select().from(schema.items).where(eq(schema.items.id, itemId));
    if (!tracked || tracked.deletedAt) throw new Error("Select an existing, tracked item");
    const result = await withLock(`item:${itemId}`, async lease => {
      const c = await getConfig();
      const current = await new WebflowClient(c.siteToken, c.apiBase).getItem(tracked.collectionId, itemId);
      await assertPrimaryLocale(current.cmsLocaleId);
      const saved = await saveSnapshot({ itemId, collectionId: tracked.collectionId, source: "manual", ...current,
        sourceUpdatedAt: current.lastUpdated ? new Date(current.lastUpdated) : undefined,
        operationKey: `manual:${itemId}:${requestId}`, checkpoint: "Manual checkpoint" }, lease);
      if (!saved.snapshotId) throw new Error("Item changed during capture; refresh and retry");
      await setSnapshotLabel(saved.snapshotId, label);
      await recordEvent({ type: "checkpoint", itemId, collectionId: tracked.collectionId,
        snapshotId: saved.snapshotId, eventKey: `manual:${itemId}:${requestId}`, summary: `Checkpoint: ${label.trim()}` });
      return saved;
    });
    return NextResponse.json({ ok: true, snapshotId: result.snapshotId });
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Capture failed" }, { status: 400 }); }
}
