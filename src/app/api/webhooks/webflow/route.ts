import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { getConfig } from "@/lib/env";
import { verifyWebflowSignature, sha256Hex } from "@/lib/crypto";
import { canonicalJson } from "@/lib/snapshots";
import { parseWebhook } from "@/lib/webhook-events";
import { processInboxEvent } from "@/lib/ingest";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (rawBody.length > 1_000_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  try {
    const db = await getDb();
    const registered = await db.select().from(schema.webhooks);
    const timestamp = request.headers.get("x-webflow-timestamp");
    const signature = request.headers.get("x-webflow-signature");
    let verified = false;
    for (const hook of registered) {
      if (hook.secret && await verifyWebflowSignature({ secret: hook.secret, timestamp, signature, rawBody })) { verified = true; break; }
    }
    if (!verified) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    let body;
    try { body = parseWebhook(rawBody); }
    catch { return NextResponse.json({ error: "Invalid CMS webhook payload" }, { status: 400 }); }
    const config = await getConfig();
    if (body.payload.siteId !== config.siteId) return NextResponse.json({ error: "Site mismatch" }, { status: 403 });
    // Content plus source timestamps identify a delivery independently of its retry signature.
    const id = await sha256Hex(canonicalJson(body));
    await db.insert(schema.webhookInbox).values({ id, body: canonicalJson(body), receivedAt: new Date() }).onConflictDoNothing();
    await processInboxEvent(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook pending retry:", err instanceof Error ? err.message : "Unknown error");
    // A durable inbox entry remains available for replay. Non-200 also requests Webflow retry.
    return NextResponse.json({ error: "Processing pending; delivery can be retried safely" }, { status: 503, headers: { "Retry-After": "30" } });
  }
}
