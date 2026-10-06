"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "@/lib/basePath";
import { Spinner } from "@/components/ui";

/** Quiet on-demand re-sync — picks up renames, schema changes, new collections. */
export function SyncCollectionsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setDone(null);
    setError(null);
    try {
      const res = await fetch(apiPath("/api/sync"), { method: "POST" });
      const body = (await res.json()) as {
        ok: boolean;
        collections?: number;
        error?: string;
      };
      if (body.ok) {
        setDone(
          `✓ Synced ${body.collections} collection${body.collections === 1 ? "" : "s"}`,
        );
        router.refresh();
      } else {
        setError(body.error ?? "Sync failed");
      }
    } catch {
      setError("Can't reach the server — try again in a minute.");
    }
    setBusy(false);
  }

  return (
    <span className="flex items-center gap-3">
      {busy ? (
        <span className="flex items-center gap-2 text-[13px] text-ink-soft">
          <Spinner />
          Syncing…
        </span>
      ) : error ? (
        <span className="flex min-w-0 items-center gap-2.5 text-[13px] text-warn">
          <span className="max-w-[280px] truncate" title={error}>
            {error}
          </span>
          <button onClick={run} className="shrink-0 font-semibold">
            Retry
          </button>
        </span>
      ) : done ? (
        <span className="text-[13px] font-semibold text-accent-deep">{done}</span>
      ) : (
        <button
          onClick={run}
          className="rounded-[7px] border border-line bg-surface px-3.5 py-[7px] text-[13px] font-semibold text-ink transition-colors hover:border-line-strong"
        >
          Sync collections
        </button>
      )}
    </span>
  );
}
