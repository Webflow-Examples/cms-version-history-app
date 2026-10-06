import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";
import { NextRequest } from "next/server";

const context = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => context }));

import { getDb, schema } from "../src/db";
import { saveSnapshot, canonicalJson, loadSnapshotContent } from "../src/lib/snapshots";
import { POST } from "../src/app/api/webhooks/webflow/route";
import { processInboxEvent } from "../src/lib/ingest";
import { withLock } from "../src/lib/locks";
import { hmacSha256Hex, sha256Hex } from "../src/lib/crypto";
import { restoreSnapshot } from "../src/lib/restore";
import { eq } from "drizzle-orm";
import { getItemPreviews } from "../src/lib/item-previews";

let mf: Miniflare;
const secret = "test-webhook-secret";
const fields = { name: "Example", slug: "example", body: "Original" };
const base = { itemId: "item", collectionId: "collection", source: "webhook" as const,
  fieldData: fields, isDraft: false, isArchived: false, lastPublished: "2026-01-01T00:00:00Z" };
beforeAll(async () => {
  mf = new Miniflare({ workers: [{ name: "tests", modules: true, script: "export default {fetch(){return new Response('test')}}", compatibilityDate: "2025-03-01", d1Databases: ["DB"], r2Buckets: ["SNAPSHOTS"], kvNamespaces: ["CACHE"] }] });
  context.env = { DB: await mf.getD1Database("DB"), SNAPSHOTS: await mf.getR2Bucket("SNAPSHOTS"), CACHE: await mf.getKVNamespace("CACHE"),
    WEBFLOW_SITE_ID: "site", WEBFLOW_SITE_TOKEN: "test-token", APP_PASSWORD: "test", SESSION_SECRET: "test-secret", WEBFLOW_API_BASE: "https://mock.invalid/v2" };
  await getDb();
});
beforeEach(async () => {
  vi.restoreAllMocks();
  delete context.env.PRODUCTION_SITE_URL;
  delete context.env.STAGING_SITE_URL;
  const cache = await mf.getKVNamespace("CACHE") as unknown as { delete(key: string): Promise<void> };
  await cache.delete("item-preview-site:v1:site");
  const db = await getDb();
  for (const table of [schema.webhookInbox, schema.snapshots, schema.items, schema.events, schema.collections, schema.webhooks, schema.historySettings, schema.restoreOperations]) await db.delete(table);
  await db.insert(schema.collections).values({ id: "collection", siteId: "site", displayName: "Test", slug: "test" });
  await db.insert(schema.webhooks).values({ id: "hook", triggerType: "collection_item_changed", url: "https://app.invalid/api/webhooks/webflow", secret, createdAt: new Date() });
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected outbound API request"));
});

describe("preview domain discovery", () => {
  it("caches site metadata across item views while using each item's own slug", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ shortName: "cms-source", customDomains: [{ id: "domain", url: "www.example.com" }] }));
    const first = await getItemPreviews("blog", "first");
    const second = await getItemPreviews("blog", "second");
    expect(first.live[0].url).toBe("https://www.example.com/blog/first");
    expect(second.staging?.url).toBe("https://cms-source.webflow.io/blog/second");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("https://mock.invalid/v2/sites/site");
  });
  it("does not require the API when both environment overrides are supplied", async () => {
    context.env.PRODUCTION_SITE_URL = "https://live.example.com";
    context.env.STAGING_SITE_URL = "https://preview.example.com";
    expect((await getItemPreviews("blog", "item")).live[0].url).toBe("https://live.example.com/blog/item");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps overrides working and reports unavailable discovery without breaking history", async () => {
    context.env.PRODUCTION_SITE_URL = "https://live.example.com";
    const previews = await getItemPreviews("blog", "item");
    expect(previews.live).toHaveLength(1);
    expect(previews.staging).toBeNull();
    expect(previews.notices.join(" ")).toContain("STAGING_SITE_URL");
  });
});
afterAll(async () => { vi.restoreAllMocks(); await mf?.dispose(); });

function payload(time = "2026-01-01T01:00:00Z") {
  return { id: "item", siteId: "site", collectionId: "collection", fieldData: fields, isDraft: false, isArchived: false, lastUpdated: time, lastPublished: null };
}
async function deliver(triggerType: string, p: Record<string, unknown> = payload(), badSignature = false) {
  const raw = JSON.stringify({ triggerType, payload: p });
  const timestamp = String(Date.now());
  const signature = badSignature ? "bad" : await hmacSha256Hex(secret, `${timestamp}:${raw}`);
  return POST(new NextRequest("https://app.invalid/api/webhooks/webflow", { method: "POST", body: raw,
    headers: { "x-webflow-timestamp": timestamp, "x-webflow-signature": signature } }));
}

describe("durable delivery and snapshot storage", () => {
  it("stores one snapshot and one audit event for a retried delivery", async () => {
    expect((await deliver("collection_item_changed")).status).toBe(200);
    expect((await deliver("collection_item_changed")).status).toBe(200);
    const db = await getDb();
    expect(await db.select().from(schema.snapshots)).toHaveLength(1);
    expect(await db.select().from(schema.events)).toHaveLength(1);
    expect(await db.select().from(schema.webhookInbox)).toHaveLength(1);
  });
  it("does not deduplicate away a publish milestone", async () => {
    await saveSnapshot(base);
    await deliver("collection_item_published", { ...payload(), lastPublished: "2026-01-01T01:00:00Z" });
    const db = await getDb();
    const snaps = await db.select().from(schema.snapshots);
    expect(snaps).toHaveLength(2);
    expect(snaps[0].r2Key).toBe(snaps[1].r2Key);
    expect(snaps[1].checkpoint).toBe("Published");
  });
  it("retains a failed delivery for replay and requests a retry", async () => {
    const failing = { ...payload(), collectionId: "unknown" };
    expect((await deliver("collection_item_changed", failing)).status).toBe(503);
    const db = await getDb();
    const [entry] = await db.select().from(schema.webhookInbox);
    expect(entry.status).toBe("failed");
    expect(JSON.parse(entry.body).payload.fieldData).toEqual(fields);
    await db.insert(schema.collections).values({ id: "unknown", siteId: "site", displayName: "Recovered", slug: "recovered" });
    await processInboxEvent(entry.id);
    expect((await db.select().from(schema.webhookInbox))[0].status).toBe("completed");
  });
  it("does not regress current state when an older update arrives", async () => {
    await deliver("collection_item_changed", { ...payload("2026-01-02T00:00:00Z"), fieldData: { ...fields, name: "Newest" } });
    await deliver("collection_item_changed", payload("2026-01-01T00:00:00Z"));
    const db = await getDb();
    expect((await db.select().from(schema.items))[0].name).toBe("Newest");
    expect(await db.select().from(schema.snapshots)).toHaveLength(1);
  });
  it("prevents a delayed update from resurrecting a deleted item", async () => {
    await deliver("collection_item_changed");
    await deliver("collection_item_deleted", payload("2026-01-03T00:00:00Z"));
    await deliver("collection_item_changed", payload("2026-01-02T00:00:00Z"));
    expect((await (await getDb()).select().from(schema.items))[0].deletedAt).not.toBeNull();
  });
  it("rejects wrong-site and unsigned events before inbox persistence", async () => {
    expect((await deliver("collection_item_changed", payload(), true)).status).toBe(401);
    expect((await deliver("collection_item_changed", { ...payload(), siteId: "other-site" })).status).toBe(403);
    expect(await (await getDb()).select().from(schema.webhookInbox)).toHaveLength(0);
  });
  it("serializes concurrent processing and permits safe replay", async () => {
    const results = await Promise.all([deliver("collection_item_changed"), deliver("collection_item_changed")]);
    expect(results.some(r => r.status === 200)).toBe(true);
    expect((await deliver("collection_item_changed")).status).toBe(200);
    expect(await (await getDb()).select().from(schema.snapshots)).toHaveLength(1);
  });
  it("enforces cross-isolate item ownership", async () => {
    await withLock("test-lock", async () => {
      await expect(withLock("test-lock", async () => 1)).rejects.toThrow("being processed");
    });
    expect(await withLock("test-lock", async () => 2)).toBe(2);
  });
  it("clears publication metadata on unpublish", async () => {
    await saveSnapshot(base);
    await deliver("collection_item_unpublished", { ...payload(), isDraft: true, lastPublished: null });
    expect((await (await getDb()).select().from(schema.items))[0].lastPublishedAt).toBeNull();
  });
  it("retains a late publish milestone without regressing newer content", async () => {
    await deliver("collection_item_changed", { ...payload("2026-01-04T00:00:00Z"), fieldData: { ...fields, name: "New draft" } });
    await deliver("collection_item_published", { ...payload("2026-01-02T00:00:00Z"), lastPublished: "2026-01-02T00:00:00Z" });
    const db = await getDb();
    expect((await db.select().from(schema.items))[0].name).toBe("New draft");
    expect((await db.select().from(schema.snapshots)).some(s => s.checkpoint === "Published")).toBe(true);
  });
  it("ignores secondary locales without contaminating primary history", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ locales: { primary: { cmsLocaleId: "en" } } }));
    expect((await deliver("collection_item_changed", { ...payload(), cmsLocaleId: "fr" })).status).toBe(200);
    const db = await getDb();
    expect(await db.select().from(schema.items)).toHaveLength(0);
    expect((await db.select().from(schema.webhookInbox))[0].status).toBe("ignored");
  });
  it("keeps a failed blob write replayable without advancing item state", async () => {
    const bucket = context.env.SNAPSHOTS;
    context.env.SNAPSHOTS = { head: async () => null, put: async () => { throw new Error("R2 unavailable"); } };
    try {
      expect((await deliver("collection_item_changed")).status).toBe(503);
      const db = await getDb();
      expect(await db.select().from(schema.items)).toHaveLength(0);
      expect((await db.select().from(schema.webhookInbox))[0].status).toBe("failed");
    } finally { context.env.SNAPSHOTS = bucket; }
    expect((await deliver("collection_item_changed")).status).toBe(200);
  });
});

describe("restore safety", () => {
  async function fixture() {
    const old = await saveSnapshot({ ...base, fieldData: { ...fields, body: "Old copy" } });
    const current = { id: "item", fieldData: fields, isDraft: false, isArchived: false, lastPublished: "2026-01-01T00:00:00Z", lastUpdated: "2026-01-02T00:00:00Z", createdOn: "2026-01-01T00:00:00Z" };
    const expectedHash = await sha256Hex(canonicalJson({ fieldData: fields, isDraft: false, isArchived: false }));
    const calls: string[] = [];
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      calls.push(`${init?.method} ${url}`);
      if (String(url).endsWith("/collections/collection")) return Response.json({ fields: Object.keys(fields).map(slug => ({ slug, displayName: slug, type: "PlainText" })) });
      if (init?.method === "PATCH") {
        const snaps = await (await getDb()).select().from(schema.snapshots);
        expect(snaps.some(s => s.checkpoint === "Before restore")).toBe(true);
        const b = JSON.parse(init.body as string);
        return Response.json({ ...current, ...b, lastUpdated: "2026-01-03T00:00:00Z" });
      }
      if (String(url).endsWith("/publish")) return Response.json({ publishedItemIds: [], errors: ["not published"] });
      return Response.json(current);
    });
    return { old, current, expectedHash, calls };
  }
  it("backs up actual current state before mutating", async () => {
    const { old, expectedHash } = await fixture();
    const result = await restoreSnapshot(old.snapshotId!, "draft", expectedHash);
    expect(result.published).toBe(false);
    const db = await getDb();
    const [backup] = await db.select().from(schema.snapshots).where(eq(schema.snapshots.checkpoint, "Before restore"));
    expect((await loadSnapshotContent(backup.r2Key)).fieldData).toEqual(fields);
  });
  it("refuses to overwrite edits made after the user loaded the page", async () => {
    const { old, calls } = await fixture();
    await expect(restoreSnapshot(old.snapshotId!, "draft", "0".repeat(64))).rejects.toThrow("changed since");
    expect(calls.some(c => c.startsWith("PATCH"))).toBe(false);
  });
  it("does not report a failed publish as successful", async () => {
    const { old, expectedHash } = await fixture();
    await expect(restoreSnapshot(old.snapshotId!, "live", expectedHash)).rejects.toThrow("did not confirm publication");
    const [item] = await (await getDb()).select().from(schema.items);
    expect(item.isDraft).toBe(true);
  });
  it("returns the same completed restore on request replay without writing twice", async () => {
    const { old, expectedHash, calls } = await fixture();
    const requestId = crypto.randomUUID();
    const first = await restoreSnapshot(old.snapshotId!, "draft", expectedHash, requestId);
    const second = await restoreSnapshot(old.snapshotId!, "draft", expectedHash, requestId);
    expect(second).toEqual(first);
    expect(calls.filter(c => c.startsWith("PATCH"))).toHaveLength(1);
  });
  it("blocks re-execution when a submitted restore has an uncertain outcome", async () => {
    const { old, expectedHash, calls } = await fixture();
    const requestId = crypto.randomUUID();
    await expect(restoreSnapshot(old.snapshotId!, "live", expectedHash, requestId)).rejects.toThrow("did not confirm publication");
    await expect(restoreSnapshot(old.snapshotId!, "live", expectedHash, requestId)).rejects.toThrow("already submitted");
    expect(calls.filter(c => c.startsWith("PATCH"))).toHaveLength(1);
  });
});
