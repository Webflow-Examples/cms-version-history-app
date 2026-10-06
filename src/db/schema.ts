import {
  sqliteTable,
  text,
  integer,
  index,
} from "drizzle-orm/sqlite-core";

// Webflow CMS collections synced from the site
export const collections = sqliteTable("collections", {
  id: text("id").primaryKey(), // Webflow collection id
  siteId: text("site_id").notNull(),
  displayName: text("display_name").notNull(),
  slug: text("slug").notNull(),
  // Full collection schema (field definitions) as returned by the Data API —
  // used to render diffs with proper field types/labels
  schemaJson: text("schema_json"),
  itemCount: integer("item_count").notNull().default(0),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
});

// Latest known state of each CMS item (one row per item, updated in place)
export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(), // Webflow item id
    collectionId: text("collection_id").notNull(),
    name: text("name"),
    slug: text("slug"),
    isDraft: integer("is_draft", { mode: "boolean" }),
    isArchived: integer("is_archived", { mode: "boolean" }),
    lastPublishedAt: integer("last_published_at", { mode: "timestamp_ms" }),
    // Set when we see a collection_item_deleted event; we keep snapshots for recovery
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
    sourceUpdatedAt: integer("source_updated_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("items_collection_idx").on(t.collectionId)],
);

// One row per captured item state. Content lives in R2 keyed by contentHash;
// identical states share a blob (content-addressed dedupe).
export const snapshots = sqliteTable(
  "snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: text("item_id").notNull(),
    collectionId: text("collection_id").notNull(),
    takenAt: integer("taken_at", { mode: "timestamp_ms" }).notNull(),
    // How this snapshot was captured
    source: text("source", {
      enum: ["webhook", "backfill", "restore", "manual"],
    }).notNull(),
    // Webflow webhook trigger that produced it, when source = webhook
    triggerType: text("trigger_type"),
    contentHash: text("content_hash").notNull(),
    r2Key: text("r2_key").notNull(),
    // Best-effort attribution (whatever the payload exposes — see spike A)
    actor: text("actor"),
    isDraft: integer("is_draft", { mode: "boolean" }),
    lastPublishedAt: integer("last_published_at", { mode: "timestamp_ms" }),
    // Optional human-given name for a key version (e.g. "Launch copy")
    label: text("label"),
    operationKey: text("operation_key"),
    checkpoint: text("checkpoint"),
  },
  (t) => [
    index("snapshots_item_idx").on(t.itemId, t.takenAt),
    index("snapshots_collection_idx").on(t.collectionId, t.takenAt),
  ],
);

// Append-only audit trail (every webhook delivery, backfill, restore, schedule run)
export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ts: integer("ts", { mode: "timestamp_ms" }).notNull(),
    type: text("type").notNull(), // e.g. collection_item_changed, backfill, restore
    itemId: text("item_id"),
    collectionId: text("collection_id"),
    snapshotId: integer("snapshot_id"),
    actor: text("actor"),
    summary: text("summary"),
    detailJson: text("detail_json"),
    eventKey: text("event_key"),
  },
  (t) => [
    index("events_ts_idx").on(t.ts),
    index("events_item_idx").on(t.itemId, t.ts),
  ],
);

export const historySettings = sqliteTable("history_settings", {
  scope: text("scope").primaryKey(),
  policyJson: text("policy_json").notNull(),
});

export const restoreOperations = sqliteTable("restore_operations", {
  id: text("id").primaryKey(),
  requestJson: text("request_json").notNull(),
  resultJson: text("result_json"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const webhookInbox = sqliteTable("webhook_inbox", {
  id: text("id").primaryKey(),
  body: text("body").notNull(),
  receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  error: text("error"),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

// Registered Webflow webhooks (created programmatically so we hold the secret)
export const webhooks = sqliteTable("webhooks", {
  id: text("id").primaryKey(), // Webflow webhook id
  triggerType: text("trigger_type").notNull(),
  url: text("url").notNull(),
  secret: text("secret"), // secretKey returned on creation (site-token webhooks)
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

// Resumable long-running work (backfills). Cursor advances page by page so a
// job survives the 20s request timeout via repeated /continue calls.
export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["backfill"] }).notNull(),
  collectionId: text("collection_id"),
  status: text("status", {
    enum: ["pending", "running", "completed", "failed"],
  }).notNull(),
  cursor: integer("cursor").notNull().default(0), // items processed so far
  total: integer("total"),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

// Phase 3: scheduled publish/unpublish actions (table ships now, UI later)
export const schedules = sqliteTable(
  "schedules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    action: text("action", {
      enum: [
        "publish_items",
        "unpublish_item",
        "site_publish_staging",
        "site_publish_page",
      ],
    }).notNull(),
    targetJson: text("target_json").notNull(), // { collectionId, itemIds } etc.
    runAt: integer("run_at", { mode: "timestamp_ms" }).notNull(),
    recurrence: text("recurrence"), // cron-ish expression, null = one-shot
    status: text("status", {
      enum: ["pending", "running", "completed", "failed", "canceled"],
    }).notNull(),
    result: text("result"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("schedules_due_idx").on(t.status, t.runAt)],
);
