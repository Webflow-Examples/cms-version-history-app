"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "@/lib/basePath";
export function ReplayButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function replay() {
    setBusy(true);
    try {
      const res = await fetch(apiPath("/api/inbox/replay"), { method: "POST" });
      if (!res.ok) throw new Error("Replay could not complete");
      const body = await res.json() as { completed: number }; setMessage(`Processed ${body.completed} events. Any remaining failures are listed below.`); router.refresh();
    } catch (err) { setMessage(err instanceof Error ? err.message : "Replay failed"); }
    finally { setBusy(false); }
  }
  return <div className="mt-3"><button disabled={busy} onClick={replay} className="rounded border border-line px-3 py-2 text-sm disabled:opacity-50">{busy ? "Replaying…" : "Retry pending events"}</button><p role="status" className="mt-2 text-sm">{message}</p></div>;
}
