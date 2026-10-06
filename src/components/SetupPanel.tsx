"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "@/lib/basePath";
import { Spinner } from "@/components/ui";

function Check({
  done,
  children,
}: {
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-2 text-sm ${done ? "text-ink" : "text-ink-soft"}`}
    >
      {done ? (
        <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-accent text-[11px] text-white">
          ✓
        </span>
      ) : (
        <span className="size-[18px] shrink-0 rounded-full border-[1.5px] border-line-strong" />
      )}
      {children}
    </div>
  );
}

export function SetupPanel({
  collectionsFound,
  webhooksRegistered,
}: {
  collectionsFound: number;
  webhooksRegistered: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasCollections = collectionsFound > 0;
  const label = hasCollections || webhooksRegistered ? "Finish setup" : "Run setup";

  async function runSetup() {
    setBusy(true);
    setError(null);
    const res = await fetch(apiPath("/api/setup"), { method: "POST" });
    const body = (await res.json()) as { ok: boolean; error?: string };
    setBusy(false);
    if (body.ok) {
      router.refresh();
    } else {
      setError(body.error ?? "Setup failed");
    }
  }

  return (
    <div className="mt-5 flex flex-col gap-5 rounded-[10px] border border-line bg-surface px-5 py-4 shell:flex-row shell:items-center shell:gap-7">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">{label}</div>
        <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-2">
          <Check done={hasCollections}>
            Collections synced
            {hasCollections && (
              <span className="font-mono text-xs text-faint">
                {collectionsFound} found
              </span>
            )}
          </Check>
          <Check done={webhooksRegistered}>Webhooks registered</Check>
        </div>
        <p className="mt-2.5 text-[13px] text-faint">
          Until webhooks are registered, edits in Webflow aren&rsquo;t being
          captured.
        </p>
        {error && (
          <div className="mt-2.5 rounded-[7px] border border-warn-line bg-warn-bg px-3 py-2.5 text-[13px] text-warn">
            Setup failed — {error}{" "}
            <button onClick={runSetup} className="font-semibold">
              Retry
            </button>
          </div>
        )}
      </div>
      <button
        onClick={runSetup}
        disabled={busy}
        aria-busy={busy}
        className="flex shrink-0 items-center gap-2 self-start rounded-[7px] bg-accent px-4.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-deep disabled:opacity-75 shell:self-center"
      >
        {busy ? (
          <>
            <Spinner onDark />
            Running…
          </>
        ) : (
          label
        )}
      </button>
    </div>
  );
}
