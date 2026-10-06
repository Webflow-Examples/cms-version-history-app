"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiPath } from "@/lib/basePath";
import { Chip, LatestTag } from "@/components/ui";
import { groupHistory, type HistoryPolicy } from "@/lib/history-policy";
import { formatDate } from "@/lib/format";

export interface VersionRow {
  id: number;
  version: number;
  takenAt: string;
  chipLabel: string;
  chipDashed: boolean;
  state: string;
  isLatest: boolean;
  label: string | null;
  checkpoint: string | null;
  source: string;
  triggerType: string | null;
}

/**
 * The timeline rail. Click an older version to compare it against the latest
 * snapshot, or the current version to view its full state on its own. Name a
 * key version inline so it's easy to find later. Selection serializes to the
 * URL as ?a=&b= so the diff stays server-rendered.
 */
export function VersionsList({
  versions,
  aId,
  bId,
  className = "",
  policy,
}: {
  versions: VersionRow[];
  aId: number | null;
  bId: number | null;
  className?: string;
  policy: HistoryPolicy;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const historyPage = useSearchParams().get("historyPage") ?? "1";
  const [showAll, setShowAll] = useState(false);
  const groups = groupHistory(versions, showAll ? { ...policy, mode: "all" } : policy);

  const byId = new Map(versions.map((v) => [v.id, v]));
  const va = aId ? byId.get(aId) : undefined;
  const vb = bId ? byId.get(bId) : undefined;
  const lo = Math.min(va?.version ?? Infinity, vb?.version ?? Infinity);
  const hi = Math.max(va?.version ?? -Infinity, vb?.version ?? -Infinity);

  function select(v: VersionRow) {
    // versions is newest-first, so [0] is the latest snapshot.
    const latest = versions[0];
    if (v.id === latest.id) {
      // Clicking the current version selects just it and shows its full state
      // (a lone ?b= — no base to diff against).
      router.push(`${pathname}?b=${v.id}&historyPage=${historyPage}`, { scroll: false });
      return;
    }
    // Plain click on an older version: compare it (base) against the latest.
    router.push(`${pathname}?a=${v.id}&b=${latest.id}&historyPage=${historyPage}`, { scroll: false });
  }

  return (
    <div className={className}>
      <div className="border-b border-line px-5 py-3 text-xs text-ink-soft">
        <label className="flex items-center gap-2"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />Show every captured edit</label>
        <p className="mt-1">{showAll ? versions.length : groups.length} entries · {versions.length} recovery points loaded</p>
      </div>
      {groups.map((group) => {
        const v = group[0];
        const isA = v.id === va?.id;
        const isB = v.id === vb?.id;
        const inRange = v.version >= lo && v.version <= hi;
        const selected = isA || isB || (Boolean(va && vb) && inRange);
        return (
          <div key={v.id}><VersionItem
            key={v.id}
            v={v}
            selected={selected}
            isB={isB}
            showBase={isA && va?.id !== vb?.id}
            onSelect={select}
          />
          {group.length > 1 && <details className="border-b border-line bg-paper text-xs">
            <summary className="cursor-pointer px-5 py-2 text-accent">Editing session · {group.length} saves — expand earlier edits</summary>
            {group.slice(1).map(edit => <VersionItem key={edit.id} v={edit} selected={edit.id === aId || edit.id === bId} isB={edit.id === bId} showBase={edit.id === aId} onSelect={select} />)}
          </details>}</div>
        );
      })}
    </div>
  );
}

function VersionItem({
  v,
  selected,
  isB,
  showBase,
  onSelect,
}: {
  v: VersionRow;
  selected: boolean;
  isB: boolean;
  showBase: boolean;
  onSelect: (v: VersionRow) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(v.label ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(apiPath("/api/snapshots/label"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshotId: v.id, label: value.trim() }),
      });
      if (!res.ok) throw new Error("Could not save the version name");
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function openEditor(e: React.MouseEvent) {
    e.stopPropagation();
    setValue(v.label ?? "");
    setEditing(true);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onSelect(v)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(v);
        }
      }}
      className={`group block w-full cursor-pointer border-b border-line px-5 py-3 text-left transition-colors ${
        selected
          ? "bg-selected shadow-[inset_3px_0_0_var(--color-accent)]"
          : "hover:bg-paper"
      }`}
    >
      <div className="flex items-baseline gap-2.5">
        <span
          className={`font-mono text-sm font-medium ${selected ? "text-ink" : "text-ink-soft"}`}
        >
          v{v.version}
        </span>
        <span className="font-mono text-xs text-ink-soft">{formatDate(new Date(v.takenAt))}</span>
        <span className="ml-auto">
          {v.isLatest ? (
            <LatestTag />
          ) : showBase ? (
            <span className="font-mono text-[10px] text-accent">base</span>
          ) : selected && !isB ? (
            <span className="font-mono text-[10px] text-faint">in range</span>
          ) : null}
        </span>
      </div>

      {/* Name row. While editing, swallow clicks/keys so the inline form never
          triggers a diff. When not editing, let them fall through so empty space
          in this row still selects the version — the name buttons stop their own
          propagation via openEditor. */}
      <div
        className="mt-1.5"
        onClick={editing ? (e) => e.stopPropagation() : undefined}
        onKeyDown={editing ? (e) => e.stopPropagation() : undefined}
      >
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={value}
              maxLength={60}
              placeholder="Name this version"
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setEditing(false);
                }
              }}
              className="min-w-0 flex-1 rounded-[6px] border border-line bg-surface px-2 py-1 text-[13px] outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-[6px] bg-ink px-2 py-1 font-mono text-[11px] text-white disabled:opacity-60"
            >
              save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-1 font-mono text-[11px] text-faint hover:text-ink"
            >
              cancel
            </button>
          </div>
        ) : v.label ? (
          <button
            type="button"
            onClick={openEditor}
            title="Rename this version"
            className="inline-flex max-w-full items-center rounded-full border border-accent-line bg-surface px-2 py-px text-left text-[12px] font-medium text-accent-deep hover:border-accent"
          >
            <span className="truncate">{v.label}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={openEditor}
            className={`font-mono text-[11px] text-faint transition-opacity hover:text-accent ${
              selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            + name
          </button>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <Chip dashed={v.chipDashed} className={selected ? "bg-surface" : ""}>
          {v.checkpoint ?? v.chipLabel}
        </Chip>
        <span className="font-mono text-[11px] text-faint">{v.state}</span>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-warn">{error}</p>}
    </div>
  );
}
