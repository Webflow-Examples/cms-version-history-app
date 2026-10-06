import { CMS_ITEM_TRIGGERS } from "./webflow";

export interface WebhookBody { triggerType: string; payload: Record<string, unknown> }
export function parseWebhook(raw: string): WebhookBody {
  const body = JSON.parse(raw);
  if (!body || !CMS_ITEM_TRIGGERS.includes(body.triggerType) || !body.payload || typeof body.payload !== "object" || Array.isArray(body.payload))
    throw new Error("Unsupported or invalid CMS webhook");
  for (const key of ["id", "collectionId", "siteId"])
    if (typeof body.payload[key] !== "string" || !body.payload[key]) throw new Error(`Missing ${key}`);
  for (const key of ["isDraft", "isArchived"])
    if (body.payload[key] != null && typeof body.payload[key] !== "boolean") throw new Error(`Invalid ${key}`);
  if (body.payload.fieldData != null && (typeof body.payload.fieldData !== "object" || Array.isArray(body.payload.fieldData)))
    throw new Error("Invalid fieldData");
  return body;
}

export function eventTime(body: WebhookBody, fallback: Date): Date {
  const p = body.payload;
  const values = [p.lastUpdated, ...(body.triggerType === "collection_item_published" ? [p.lastPublished] : [])]
    .filter((v): v is string => typeof v === "string").map(Date.parse).filter(Number.isFinite);
  return values.length ? new Date(Math.max(...values)) : fallback;
}
