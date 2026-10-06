"use client";
import { useState, useRef, useId } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "@/lib/basePath";

export function CheckpointButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef<string | null>(null);
  const formId = useId();
  const nameId = useId();
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const res = await fetch(apiPath("/api/checkpoints"), { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, label: name, requestId: requestId.current }) });
      const body = await res.json() as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Capture failed");
      setOpen(false); setName(""); requestId.current = null; router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Capture failed"); }
    finally { setBusy(false); }
  }
  return <div className="mt-3 text-sm">
    <button
      type="button"
      aria-expanded={open}
      aria-controls={open ? formId : undefined}
      disabled={busy}
      className="inline-flex min-h-11 items-center gap-2 rounded-[7px] border border-accent bg-accent px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-50"
      onClick={() => setOpen(!open)}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 4h12v17l-6-4-6 4V4Z" /><path d="M9 10h6m-3-3v6" />
      </svg>
      Save checkpoint
    </button>
    {open && <form id={formId} onSubmit={save} className="mt-3 rounded-[7px] border border-line bg-paper p-3">
      <label htmlFor={nameId}>Checkpoint name</label>
      <input id={nameId} autoFocus maxLength={60} value={name} onChange={e => { setName(e.target.value); requestId.current = null; }} className="my-2 w-full rounded border border-line bg-surface p-2" required />
      <button disabled={busy} className="rounded bg-ink px-3 py-2 text-white disabled:opacity-50">{busy ? "Capturing…" : "Capture current state"}</button>
      <button type="button" disabled={busy} onClick={() => setOpen(false)} className="ml-2 px-2 py-2 text-ink-soft hover:text-ink">Cancel</button>
      {error && <p role="alert" className="mt-2 text-warn">{error}</p>}
    </form>}
  </div>;
}
