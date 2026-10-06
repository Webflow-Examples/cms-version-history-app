import { getBindings, getDb } from "@/db";

export class BusyError extends Error {}

/** Cross-isolate leases. Work must remain bounded; assert ownership before writes. */
export interface Lease { assertOwned: () => Promise<void> }
export async function withLock<T>(id: string, work: (lease: Lease) => Promise<T>): Promise<T> {
  await getDb();
  const { DB } = await getBindings();
  const owner = crypto.randomUUID();
  const now = Date.now();
  const claimed = await DB.prepare(`INSERT INTO work_locks(id, owner, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET owner=excluded.owner, expires_at=excluded.expires_at
    WHERE work_locks.expires_at < ? RETURNING owner`)
    .bind(id, owner, now + 120_000, now).first();
  if (!claimed) throw new BusyError("This item is being processed. Please retry shortly.");
  const lease: Lease = { assertOwned: async () => {
    const row = await DB.prepare("SELECT owner FROM work_locks WHERE id=? AND owner=? AND expires_at>?")
      .bind(id, owner, Date.now() + 5_000).first();
    if (!row) throw new BusyError("Processing lease expired; retry safely.");
  } };
  try { return await work(lease); }
  finally { await DB.prepare("DELETE FROM work_locks WHERE id=? AND owner=?").bind(id, owner).run(); }
}
