"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { StatusPill } from "@/components/ui";

export interface ItemRow {
  id: string;
  name: string;
  slug: string | null;
  statusLabel: string;
  statusClass: string;
  versions: number;
  lastChange: string;
}

const GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 shell:grid-cols-[minmax(0,1fr)_150px_100px_140px]";

export function ItemsTable({
  collectionId,
  rows,
  initialQuery = "",
}: {
  collectionId: string;
  rows: ItemRow[];
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" focuses search from anywhere on the page
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        e.key === "/" &&
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = rows;

  return (
    <>
      <form method="get" className="mt-5 flex items-center gap-2.5">
        <div className="relative max-w-[380px] flex-1">
          <input
            name="q"
            aria-label="Search all collection items by name or slug"
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items by name or slug…"
            className="w-full rounded-[7px] border border-line bg-surface py-2 pl-3 pr-9 text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-line px-1.5 font-mono text-[10px] text-faint">
            /
          </kbd>
        </div>
        <button type="submit" className="rounded border border-line px-3 py-2 text-sm">Search</button>
        <span className="font-mono text-xs text-faint">
          {filtered.length} item{filtered.length === 1 ? "" : "s"}
        </span>
      </form>

      <div className="mt-3 overflow-hidden rounded-[10px] border border-line bg-surface">
        <div
          className={`${GRID} border-b border-line px-5 py-[9px] font-mono text-[11px] tracking-[0.05em] text-faint`}
        >
          <div>ITEM</div>
          <div className="hidden shell:block">STATUS</div>
          <div className="hidden shell:block">VERSIONS</div>
          <div className="text-right shell:text-left">LAST CHANGE</div>
        </div>

        {filtered.map((r) => (
          <Link
            key={r.id}
            href={`/collections/${collectionId}/items/${r.id}`}
            className={`${GRID} border-b border-line px-5 py-3 transition-colors last:border-b-0 hover:bg-paper`}
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-accent">
                {r.name}
              </div>
              {r.slug && (
                <div className="truncate font-mono text-[11px] text-faint">
                  /{r.slug}
                </div>
              )}
            </div>
            <div className="hidden shell:block">
              <StatusPill label={r.statusLabel} className={r.statusClass} />
            </div>
            <div className="hidden font-mono text-[13px] shell:block">
              {r.versions}
            </div>
            <div className="text-right font-mono text-xs text-ink-soft shell:text-left">
              {r.lastChange}
            </div>
          </Link>
        ))}

        {rows.length === 0 && (
          <div className="px-6 py-12 text-center text-[13px] text-ink-soft">
            No items snapshotted yet. Run a backfill, or just edit something in
            Webflow — we&rsquo;re watching.
          </div>
        )}
        {rows.length > 0 && filtered.length === 0 && (
          <div className="px-6 py-12 text-center text-[13px] text-ink-soft">
            No items match &ldquo;{query}&rdquo; —{" "}
            <button
              onClick={() => setQuery("")}
              className="text-accent hover:text-accent-deep"
            >
              clear search
            </button>
            .
          </div>
        )}
      </div>
    </>
  );
}
