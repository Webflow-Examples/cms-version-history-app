"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "@/lib/basePath";
import { Spinner } from "@/components/ui";

type Mode = "draft" | "live" | "recover";

const CONFIRM_COPY: Record<
  Mode,
  { title: (v: string) => string; body: string; cta: string }
> = {
  draft: {
    title: (v) => `Restore ${v} as a staged draft?`,
    body: "The live site is untouched until you publish. The current state is snapshotted first.",
    cta: "Restore as draft",
  },
  live: {
    title: (v) => `Restore ${v} and publish live?`,
    body: "This overwrites the live item immediately. The current state is snapshotted first — even the undo has an undo.",
    cta: "Restore + publish",
  },
  recover: {
    title: (v) => `Recover this item from ${v}?`,
    body: "Recreates the item in Webflow as a staged draft — Webflow assigns it a new item id.",
    cta: "Recover item",
  },
};

/**
 * Restore buttons for the diff header (dark surface) — confirm is a popover
 * anchored to the button. Destructive weight is carried by copy and the ink
 * button, never red.
 */
export function RestoreActions({
  snapshotId,
  versionLabel,
  nextVersion,
  recover = false,
  expectedHash,
}: {
  snapshotId: number;
  versionLabel: string;
  nextVersion: number;
  recover?: boolean;
  expectedHash: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<Mode | null>(null);
  const [busy, setBusy] = useState<Mode | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null);

  async function run(mode: Mode) {
    setConfirming(null);
    setBusy(mode);
    setError(null);
    const key = `${snapshotId}:${mode}:${expectedHash}`;
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    let body: { ok: boolean; error?: string };
    try {
      const res = await fetch(apiPath("/api/restore"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          snapshotId,
          mode: mode === "live" ? "live" : "draft",
          expectedHash,
          requestId: request.current.id,
        }),
      });
      body = (await res.json()) as { ok: boolean; error?: string };
    } catch {
      body = { ok: false, error: "Can't reach the server — try again in a minute." };
    }
    setBusy(null);
    if (body.ok) {
      setDone(
        mode === "live"
          ? `✓ Restored ${versionLabel} — published live`
          : mode === "recover"
            ? "✓ Recovered — recreated as a staged draft"
            : `✓ Restored as staged draft — snapshotted as v${nextVersion}`,
      );
      router.refresh();
    } else {
      setError(body.error ?? "Restore failed");
    }
  }

  if (done) {
    return (
      <span className="text-[13px] font-semibold text-white">{done}</span>
    );
  }

  return (
    <div className="relative flex flex-wrap items-center gap-2.5">
      {error && (
        <span
          className="max-w-[260px] truncate rounded-[7px] border border-warn-line bg-warn-bg px-2.5 py-1 text-xs text-warn"
          title={error}
        >
          {error}
        </span>
      )}

      {recover ? (
        <button
          type="button"
          onClick={() => setConfirming("recover")}
          disabled={busy !== null}
          aria-busy={busy !== null}
          className="flex items-center gap-2 rounded-[7px] border border-dark-line px-3.5 py-[7px] text-[13px] font-semibold text-dark-text transition-colors hover:border-faint hover:text-white disabled:opacity-75"
        >
          {busy ? (
            <>
              <Spinner onDark />
              Recovering…
            </>
          ) : (
            `Recover ${versionLabel}…`
          )}
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setConfirming("draft")}
            disabled={busy !== null}
            aria-busy={busy === "draft"}
            className="flex items-center gap-2 rounded-[7px] border border-dark-line px-3.5 py-[7px] text-[13px] font-semibold text-dark-text transition-colors hover:border-faint hover:text-white disabled:opacity-75"
          >
            {busy === "draft" ? (
              <>
                <Spinner onDark />
                Restoring…
              </>
            ) : (
              `Restore ${versionLabel} as draft`
            )}
          </button>
          <button
            type="button"
            onClick={() => setConfirming("live")}
            disabled={busy !== null}
            aria-busy={busy === "live"}
            className="flex items-center gap-2 rounded-[7px] bg-accent px-3.5 py-[7px] text-[13px] font-semibold text-white transition-colors hover:bg-accent-deep disabled:opacity-75"
          >
            {busy === "live" ? (
              <>
                <Spinner onDark />
                Restoring…
              </>
            ) : (
              "Restore + publish…"
            )}
          </button>
        </>
      )}

      {confirming && (
        <div className="absolute right-0 top-full z-20 mt-2 w-[320px] rounded-[10px] border border-line bg-surface p-4 text-left shadow-overlay">
          <div className="text-sm font-semibold text-ink">
            {CONFIRM_COPY[confirming].title(versionLabel)}
          </div>
          <p className="mt-1.5 text-[13px] leading-[1.55] text-ink-soft">
            {CONFIRM_COPY[confirming].body}
          </p>
          <div className="mt-3.5 flex gap-2">
            <button
              type="button"
              onClick={() => run(confirming)}
              className="rounded-[7px] bg-ink px-3.5 py-[7px] text-[13px] font-semibold text-white transition-colors hover:bg-dark"
            >
              {CONFIRM_COPY[confirming].cta}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="px-2.5 py-[7px] text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
