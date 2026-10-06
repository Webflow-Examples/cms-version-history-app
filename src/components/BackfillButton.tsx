"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "@/lib/basePath";
import { Spinner } from "@/components/ui";

interface Progress {
  jobId: number;
  status: string;
  cursor: number;
  total: number | null;
  error?: string | null;
}

const BUTTON_CLASS =
  "rounded-[7px] border border-line bg-surface px-3 py-[5px] text-xs font-semibold text-ink transition-colors hover:border-line-strong";

/**
 * Kicks off a backfill and keeps calling /continue until the job finishes —
 * this is how a 100k-item collection gets processed despite the 20s request
 * timeout on Workers. Feedback is inline, in place; no toasts.
 */
export function BackfillButton({
  collectionId,
  variant = "header",
  syncedLabel,
}: {
  collectionId: string;
  variant?: "card" | "header";
  syncedLabel?: string | null;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      let res = await fetch(apiPath("/api/backfill"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ collectionId }),
      });
      let p = (await res.json()) as Progress;
      setProgress(p);
      while (p.status === "running") {
        res = await fetch(apiPath("/api/backfill/continue"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobId: p.jobId }),
        });
        p = (await res.json()) as Progress;
        setProgress(p);
      }
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  const busyLine =
    running && progress ? (
      <span className="flex items-center gap-2 text-[13px] text-ink-soft">
        <Spinner />
        Backfilling —{" "}
        <span className="font-mono">
          {progress.cursor.toLocaleString("en-US")}
          {progress.total ? ` / ${progress.total.toLocaleString("en-US")}` : ""}
        </span>
      </span>
    ) : null;

  const failedLine =
    !running && progress?.status === "failed" ? (
      <span className="flex min-w-0 items-center justify-between gap-2.5 text-[13px] text-warn">
        <span className="truncate">
          Backfill failed{progress.error ? ` — ${progress.error}` : ""}
        </span>
        <button onClick={run} className="shrink-0 font-semibold">
          Retry
        </button>
      </span>
    ) : null;

  if (variant === "card") {
    const pct =
      running && progress?.total
        ? Math.min(100, Math.round((progress.cursor / progress.total) * 100))
        : 0;
    return (
      <div className="mt-4 border-t border-line pt-3">
        {busyLine ? (
          <>
            {busyLine}
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-sunken">
              <div
                className="h-full rounded-full bg-accent transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        ) : failedLine ? (
          failedLine
        ) : (
          <div className="flex items-center justify-between gap-3">
            {progress?.status === "completed" ? (
              <span className="text-[13px] font-semibold text-accent-deep">
                ✓ Backfill complete
              </span>
            ) : (
              <span className="font-mono text-[11px] text-faint">
                {syncedLabel ? `synced ${syncedLabel}` : "not synced yet"}
              </span>
            )}
            <button onClick={run} className={BUTTON_CLASS}>
              Backfill
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <span className="flex items-center gap-3">
      {busyLine ??
        failedLine ??
        (progress?.status === "completed" ? (
          <span className="text-[13px] font-semibold text-accent-deep">
            ✓ Backfill complete
          </span>
        ) : null)}
      {!running && (
        <button
          onClick={run}
          className="rounded-[7px] border border-line bg-surface px-3.5 py-[7px] text-[13px] font-semibold text-ink transition-colors hover:border-line-strong"
        >
          Backfill
        </button>
      )}
    </span>
  );
}
