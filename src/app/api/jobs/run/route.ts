import { NextRequest, NextResponse } from "next/server";
import { getBindings, getDb, schema } from "@/db";
import { eq, asc } from "drizzle-orm";
import { timingSafeEqual } from "@/lib/crypto";
import { replayInbox } from "@/lib/ingest";
import { continueBackfill } from "@/lib/sync";

/** Optional external scheduler: POST with Authorization: Bearer JOBS_SECRET. */
export async function POST(request: NextRequest) {
  const env = await getBindings();
  const secret = (env as unknown as Record<string, string>).JOBS_SECRET ?? process.env.JOBS_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!secret || !token || !timingSafeEqual(secret, token)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const start = Date.now();
  const replay = await replayInbox();
  let backfill = null;
  if (Date.now() - start < 3_000) {
    const db = await getDb();
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.status, "running")).orderBy(asc(schema.jobs.updatedAt)).limit(1);
    if (job) backfill = await continueBackfill(job.id);
  }
  await env.CACHE.put("jobs:last-run", new Date().toISOString());
  return NextResponse.json({ replay, backfill });
}
