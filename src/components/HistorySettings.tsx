"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "@/lib/basePath";
import { DEFAULT_POLICY, type HistoryPolicy } from "@/lib/history-policy";

export function HistorySettings({ collections, policies }: {
  collections: { id: string; displayName: string }[];
  policies: Record<string, HistoryPolicy>;
}) {
  const router = useRouter();
  const [scope, setScope] = useState("site");
  const [policy, setPolicy] = useState(policies.site ?? DEFAULT_POLICY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const input = "mt-1 block w-full rounded-[7px] border border-line bg-surface p-2 text-sm";
  async function save(inherit = false) {
    setBusy(true); setMessage("");
    try {
      const res = await fetch(apiPath("/api/history-settings"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope, policy: inherit ? null : policy }) });
      const body = await res.json() as { error?: string }; if (!res.ok) throw new Error(body.error ?? "Save failed");
      if (inherit) setPolicy(policies.site ?? DEFAULT_POLICY);
      setMessage(inherit ? "Using site defaults." : "Settings saved. Transition rules apply to future events."); router.refresh();
    } catch (err) { setMessage(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }
  return <form onSubmit={e => { e.preventDefault(); save(); }} className="space-y-5 rounded-xl border border-line bg-surface p-6">
    <h2 className="font-display text-lg font-bold">History settings</h2>
    <label className="block text-sm font-semibold">Apply to
      <select className={input} value={scope} onChange={e => { const next = e.target.value; setScope(next); setPolicy(policies[next] ?? policies.site ?? DEFAULT_POLICY); setMessage(""); }}>
        <option value="site">Site defaults</option>{collections.map(c => <option key={c.id} value={c.id}>{c.displayName}</option>)}
      </select>
    </label>
    <label className="block text-sm font-semibold">Default timeline
      <select className={input} value={policy.mode} onChange={e => setPolicy({ ...policy, mode: e.target.value as HistoryPolicy["mode"] })}>
        <option value="smart">Smart checkpoints — group editing sessions</option><option value="all">Every change</option><option value="milestones">Milestones and latest state</option>
      </select>
    </label>
    <label className="block text-sm font-semibold">Group ordinary saves within (minutes)
      <input type="number" min={1} max={60} className={input} value={policy.sessionMinutes} onChange={e => setPolicy({ ...policy, sessionMinutes: Number(e.target.value) })} />
    </label>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={policy.transitions} onChange={e => setPolicy({ ...policy, transitions: e.target.checked })} />Mark draft and archive transitions as checkpoints</label>
    <p className="text-sm text-ink-soft">Publish, unpublish, restore, and named checkpoints are always highlighted. All content changes are still retained for recovery.</p>
    <label className="block text-sm font-semibold">Watched field slugs (comma-separated)
      <input className={input} value={policy.watchedFields.join(", ")} onChange={e => setPolicy({ ...policy, watchedFields: e.target.value.split(",").map(s => s.trim()) })} placeholder="name, post-body" />
    </label>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-semibold">Custom status field slug
        <input className={input} maxLength={100} value={policy.customField} onChange={e => setPolicy({ ...policy, customField: e.target.value })} placeholder="review-status" />
      </label>
      <label className="block text-sm font-semibold">Create checkpoint when it becomes
        <input className={input} maxLength={200} value={policy.customValue} onChange={e => setPolicy({ ...policy, customValue: e.target.value })} placeholder="Approved" />
      </label>
    </div>
    <p className="text-xs text-ink-soft">Use the stored field value; Option fields use option IDs. A transition fires once when the value changes, not on later saves in the same state. This configures history checkpoints, not automatic publishing.</p>
    <div className="flex gap-3"><button disabled={busy} className="rounded bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save settings</button>
      {scope !== "site" && <button type="button" disabled={busy} onClick={() => save(true)} className="text-sm text-accent">Use site defaults</button>}
    </div>
    {message && <p role="status" className="text-sm">{message}</p>}
  </form>;
}
