import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { DEFAULT_POLICY, parsePolicy } from "./history-policy";

export async function getHistoryPolicy(collectionId?: string) {
  const db = await getDb();
  if (collectionId) {
    const [row] = await db.select().from(schema.historySettings).where(eq(schema.historySettings.scope, collectionId));
    if (row) return parsePolicy(JSON.parse(row.policyJson));
  }
  const [row] = await db.select().from(schema.historySettings).where(eq(schema.historySettings.scope, "site"));
  return row ? parsePolicy(JSON.parse(row.policyJson)) : DEFAULT_POLICY;
}
