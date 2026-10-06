// Idempotent DDL applied lazily on first DB access per isolate.
// Workers have no filesystem, so file-based migration runners don't work here;
// CREATE TABLE IF NOT EXISTS keeps the template zero-setup after deploy.
// If the schema evolves, add ALTER statements guarded by schema_meta.version.

export const BOOTSTRAP_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    slug TEXT NOT NULL,
    schema_json TEXT,
    item_count INTEGER NOT NULL DEFAULT 0,
    last_synced_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL,
    name TEXT,
    slug TEXT,
    is_draft INTEGER,
    is_archived INTEGER,
    last_published_at INTEGER,
    deleted_at INTEGER,
    updated_at INTEGER,
    source_updated_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS items_collection_idx ON items (collection_id)`,
  `CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    collection_id TEXT NOT NULL,
    taken_at INTEGER NOT NULL,
    source TEXT NOT NULL,
    trigger_type TEXT,
    content_hash TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    actor TEXT,
    is_draft INTEGER,
    last_published_at INTEGER,
    label TEXT,
    operation_key TEXT,
    checkpoint TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS snapshots_item_idx ON snapshots (item_id, taken_at)`,
  `CREATE INDEX IF NOT EXISTS snapshots_collection_idx ON snapshots (collection_id, taken_at)`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    type TEXT NOT NULL,
    item_id TEXT,
    collection_id TEXT,
    snapshot_id INTEGER,
    actor TEXT,
    summary TEXT,
    detail_json TEXT,
    event_key TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS events_ts_idx ON events (ts)`,
  `CREATE INDEX IF NOT EXISTS events_item_idx ON events (item_id, ts)`,
  `CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    trigger_type TEXT NOT NULL,
    url TEXT NOT NULL,
    secret TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    collection_id TEXT,
    status TEXT NOT NULL,
    cursor INTEGER NOT NULL DEFAULT 0,
    total INTEGER,
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    target_json TEXT NOT NULL,
    run_at INTEGER NOT NULL,
    recurrence TEXT,
    status TEXT NOT NULL,
    result TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS schedules_due_idx ON schedules (status, run_at)`,
  ...RELIABILITY_TABLES(),
];

function RELIABILITY_TABLES(): string[] {
  return [
    `CREATE UNIQUE INDEX IF NOT EXISTS snapshots_operation_idx ON snapshots(operation_key)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS events_key_idx ON events(event_key)`,
    `CREATE TABLE IF NOT EXISTS history_settings (scope TEXT PRIMARY KEY, policy_json TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS webhook_inbox (
      id TEXT PRIMARY KEY, body TEXT NOT NULL, received_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
      error TEXT, completed_at INTEGER
    )`,
    `CREATE INDEX IF NOT EXISTS inbox_pending_idx ON webhook_inbox(status, received_at)`,
    `CREATE TABLE IF NOT EXISTS work_locks (id TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS restore_operations (id TEXT PRIMARY KEY, request_json TEXT NOT NULL, result_json TEXT, created_at INTEGER NOT NULL)`,
  ];
}

/**
 * Version-guarded migrations for databases created before a column existed.
 * Fresh databases get the full schema from BOOTSTRAP_STATEMENTS and skip these.
 * ALTER ... ADD COLUMN is not idempotent, so each only runs when the recorded
 * schema_meta version is older than the migration's `version`.
 */
export const MIGRATIONS: { version: number; statements: string[] }[] = [
  // v2: name a key version
  { version: 2, statements: ["ALTER TABLE snapshots ADD COLUMN label TEXT"] },
  { version: 3, statements: [
    "ALTER TABLE items ADD COLUMN source_updated_at INTEGER",
    "ALTER TABLE snapshots ADD COLUMN operation_key TEXT",
    "ALTER TABLE snapshots ADD COLUMN checkpoint TEXT",
    "ALTER TABLE events ADD COLUMN event_key TEXT",
    ...RELIABILITY_TABLES(),
  ] },
];

export const SCHEMA_VERSION = "3";
