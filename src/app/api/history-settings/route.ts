import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { parsePolicy } from "@/lib/history-policy";
import { recordEvent } from "@/lib/snapshots";

export async function POST(request: NextRequest) {
  try {
    const { scope, policy } = await request.json() as Record<string, unknown>;
    const db = await getDb();
    if (typeof scope !== "string" || !scope) throw new Error("Choose a settings scope");
    if (scope !== "site") {
      const [collection] = await db.select().from(schema.collections).where(eq(schema.collections.id, scope));
      if (!collection) throw new Error("Unknown collection");
    }
    if (policy === null && scope !== "site") await db.delete(schema.historySettings).where(eq(schema.historySettings.scope, scope));
    else {
      const policyJson = JSON.stringify(parsePolicy(policy));
      await db.insert(schema.historySettings).values({ scope, policyJson }).onConflictDoUpdate({ target: schema.historySettings.scope, set: { policyJson } });
    }
    await recordEvent({ type: "settings", summary: `History policy updated (${scope === "site" ? "site default" : "collection override"})` });
    return NextResponse.json({ ok: true });
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Settings failed" }, { status: 400 }); }
}
