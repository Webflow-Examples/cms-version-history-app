import { desc, sql, inArray } from "drizzle-orm";
import { getDb, getBindings, schema } from "@/db";
import { parsePolicy } from "@/lib/history-policy";
import { HistorySettings } from "@/components/HistorySettings";
import { ReplayButton } from "@/components/ReplayButton";
import { formatDateLong } from "@/lib/format";
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const db = await getDb();
  const env = await getBindings();
  const [collections, settings, counts, failures, hooks, lastRun] = await Promise.all([
    db.select({ id: schema.collections.id, displayName: schema.collections.displayName }).from(schema.collections),
    db.select().from(schema.historySettings),
    db.select({ status: schema.webhookInbox.status, count: sql<number>`count(*)` }).from(schema.webhookInbox).groupBy(schema.webhookInbox.status),
    db.select({ id: schema.webhookInbox.id, receivedAt: schema.webhookInbox.receivedAt, attempts: schema.webhookInbox.attempts, error: schema.webhookInbox.error }).from(schema.webhookInbox).where(inArray(schema.webhookInbox.status, ["failed", "pending", "ignored"])).orderBy(desc(schema.webhookInbox.receivedAt)).limit(20),
    db.select({ trigger: schema.webhooks.triggerType, hasSecret: sql<number>`secret IS NOT NULL AND secret != ''` }).from(schema.webhooks),
    env.CACHE.get("jobs:last-run"),
  ]);
  return <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-8">
    <header><h1 className="font-display text-[26px] font-bold">History & health</h1><p className="mt-1 text-sm text-ink-soft">Readable checkpoints, recoverable edits, and delivery health. Primary CMS locale only.</p></header>
    <HistorySettings collections={collections} policies={Object.fromEntries(settings.map(s => [s.scope, parsePolicy(JSON.parse(s.policyJson))]))} />
    <section className="rounded-xl border border-line bg-surface p-6">
      <h2 className="font-display text-lg font-bold">Webhook inbox</h2>
      <p className="mt-2 text-sm">{counts.map(c => `${c.count} ${c.status}`).join(" · ") || "No deliveries received since the reliability upgrade."}</p>
      <p className="mt-2 text-sm text-ink-soft">Deliveries are stored before processing. Failed deliveries request Webflow retries and remain available for manual replay.</p>
      <ReplayButton />
      <ul className="mt-4 divide-y divide-line">{failures.map(f => <li key={f.id} className="py-3 text-sm"><span className="font-mono text-xs">{formatDateLong(f.receivedAt)} · {f.attempts} attempts</span><p className="mt-1 break-words">{f.error ?? "Waiting for processing"}</p></li>)}</ul>
      <h3 className="mt-5 font-semibold">Signing-key coverage</h3>
      <ul className="mt-2 text-sm">{hooks.map((h, i) => <li key={i}>{h.trigger}: {h.hasSecret ? "key stored" : "missing key — repair setup"}</li>)}</ul>
      <p className="mt-2 text-xs text-ink-soft">Stored registrations do not prove that Webflow is currently delivering events.</p>
    </section>
    <section className="rounded-xl border border-line bg-surface p-6">
      <h2 className="font-display text-lg font-bold">Background processing</h2>
      <p className="mt-2 text-sm">Last scheduler tick: {lastRun ?? "None received — external scheduler not connected"}</p>
      <p className="mt-2 text-sm text-ink-soft">An external scheduler can POST to /api/jobs/run using a dedicated JOBS_SECRET bearer token. Each tick replays a bounded inbox batch and advances running backfills when time permits. Ordinary webhooks are processed on arrival.</p>
      <p className="mt-2 text-sm text-ink-soft">Retention: all captured versions are currently retained. Timeline grouping never deletes recovery points.</p>
    </section>
  </div>;
}
