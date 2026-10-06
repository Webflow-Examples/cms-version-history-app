import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { BOOTSTRAP_STATEMENTS, MIGRATIONS, SCHEMA_VERSION } from "./bootstrap.sql";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

// Bootstrap-once-per-isolate guard. D1 DDL is idempotent so a race between
// isolates is harmless.
let bootstrapped: Promise<void> | null = null;

async function recordVersion(d1: D1Database, version: string): Promise<void> {
  await d1
    .prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)")
    .bind(version)
    .run();
}

async function ensureSchema(d1: D1Database): Promise<void> {
  const meta = await d1
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'")
    .first()
    .catch(() => null);

  if (!meta) {
    // Fresh database — BOOTSTRAP_STATEMENTS already reflect the latest schema,
    // so there's nothing to migrate.
    await d1.batch([
      ...BOOTSTRAP_STATEMENTS.map(stmt => d1.prepare(stmt)),
      d1.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)").bind(SCHEMA_VERSION),
    ]);
    return;
  }

  // Existing database — apply any migrations newer than the recorded version.
  const versionRow = await d1
    .prepare("SELECT value FROM schema_meta WHERE key = 'version'")
    .first<{ value: string }>()
    .catch(() => null);
  const current = Number(versionRow?.value ?? "0");

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    for (const stmt of migration.statements) {
      try {
        await d1.prepare(stmt).run();
      } catch (err) {
        // ADD COLUMN isn't idempotent; tolerate a concurrent isolate having
        // already applied it. Anything else is a real failure.
        const msg = err instanceof Error ? err.message : String(err);
        if (!/duplicate column name/i.test(msg)) throw err;
      }
    }
  }

  if (current < Number(SCHEMA_VERSION)) {
    await recordVersion(d1, SCHEMA_VERSION);
  }
}

export async function getDb(): Promise<Db> {
  const { env } = await getCloudflareContext({ async: true });
  if (!bootstrapped) bootstrapped = ensureSchema(env.DB);
  await bootstrapped;
  return drizzle(env.DB, { schema });
}

export async function getBindings() {
  const { env } = await getCloudflareContext({ async: true });
  return env;
}

export { schema };
