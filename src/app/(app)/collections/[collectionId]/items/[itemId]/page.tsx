import Link from "next/link";
import { notFound } from "next/navigation";
import { getItemWithSnapshots } from "@/lib/queries";
import { loadSnapshotContent } from "@/lib/snapshots";
import { diffSnapshots, snapshotFields } from "@/lib/diff";
import type { WebflowField } from "@/lib/webflow";
import {
  formatDate,
  itemStatus,
  snapshotChip,
  snapshotState,
} from "@/lib/format";
import { DiffView, VersionState } from "@/components/DiffView";
import { RestoreActions } from "@/components/RestoreActions";
import { VersionsList } from "@/components/VersionsList";
import { StatusPill } from "@/components/ui";
import { getHistoryPolicy } from "@/lib/history-settings";
import { CheckpointButton } from "@/components/CheckpointButton";
import { ItemPreviewLinks } from "@/components/ItemPreviewLinks";
import { getItemPreviews } from "@/lib/item-previews";

export const dynamic = "force-dynamic";

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ collectionId: string; itemId: string }>;
  searchParams: Promise<{ a?: string; b?: string; historyPage?: string }>;
}) {
  const { collectionId, itemId } = await params;
  const { a, b, historyPage: pageParam } = await searchParams;
  const historyPage = Math.max(1, Math.min(100000, Math.floor(Number(pageParam) || 1)));
  const data = await getItemWithSnapshots(itemId, historyPage);
  if (!data || data.item.collectionId !== collectionId) notFound();
  const { item, collection, snapshots } = data;
  const [policy, previews] = await Promise.all([
    getHistoryPolicy(collectionId),
    getItemPreviews(collection?.slug ?? null, item.slug),
  ]);
  const status = itemStatus(item);
  const deleted = Boolean(item.deletedAt);

  const total = data.total;
  const versionNumber = new Map(snapshots.map(s => [s.id, s.version]));

  // Default selection: latest vs. its predecessor, so the screen always
  // opens showing something useful. URL order is honored (⇄ swap flips it).
  const byId = new Map(snapshots.map((s) => [s.id, s]));
  const snapB = (b && byId.get(Number(b))) || snapshots[0];
  // A lone ?b= (the current version clicked on its own) shows that version's
  // full state instead of a diff — "here's the item as it stands."
  const single = !a && Boolean(b) && byId.has(Number(b));
  let snapA = a ? byId.get(Number(a)) : undefined;
  if (!single && !snapA && snapB) {
    // No (or stale) base in the URL — fall back to the predecessor
    const idx = snapshots.findIndex((s) => s.id === snapB.id);
    snapA = snapshots[idx + 1];
  }

  const schemaFields: WebflowField[] = collection?.schemaJson
    ? (JSON.parse(collection.schemaJson) as WebflowField[])
    : [];

  let diffs: ReturnType<typeof diffSnapshots> = [];
  let stateFields: ReturnType<typeof snapshotFields> = [];
  if (single && snapB) {
    const content = await loadSnapshotContent(snapB.r2Key);
    stateFields = snapshotFields(content, schemaFields);
  } else if (snapB) {
    const [contentA, contentB] = await Promise.all([
      snapA ? loadSnapshotContent(snapA.r2Key) : Promise.resolve(null),
      loadSnapshotContent(snapB.r2Key),
    ]);
    diffs = diffSnapshots(contentA, contentB, schemaFields);
  }
  const changedCount = diffs.filter((d) => d.status !== "unchanged").length;
  const unchangedCount = diffs.length - changedCount;

  // Restore rolls back to the base of the comparison (v6 in "v6 → v8")
  const restoreTarget = snapA ?? snapB;
  // When the newer side is the latest snapshot, the diff is "this version vs. now"
  const bIsLatest = Boolean(snapB && snapshots[0] && snapB.id === snapshots[0].id);

  return (
    <div className="flex flex-col shell:h-full shell:flex-row">
      {/* Versions rail */}
      <aside className="flex shrink-0 flex-col border-b border-line bg-surface shell:w-[352px] shell:border-b-0 shell:border-r">
        <header className="border-b border-line px-5 pb-4 pt-[22px]">
          <div className="text-[13px] text-faint">
            <Link
              href={`/collections/${collectionId}`}
              className="text-accent hover:text-accent-deep"
            >
              {collection?.displayName ?? collectionId}
            </Link>{" "}
            /
          </div>
          <h1 className="mt-2 font-display text-[19px] font-bold leading-[1.25]">
            {item.name ?? itemId}
          </h1>
          {item.slug && (
            <div className="mt-1 truncate font-mono text-xs text-faint">
              /{item.slug}
            </div>
          )}
          <div className="mt-2.5">
            <StatusPill label={status.label} className={status.className} />
          </div>
          {!deleted && <CheckpointButton itemId={itemId} />}
          <ItemPreviewLinks previews={previews} unpublished={Boolean(deleted || item.isDraft || item.isArchived || !item.lastPublishedAt)} />
        </header>

        {snapshots.length > 0 ? (
          <VersionsList
            policy={policy}
            className="max-h-72 min-h-0 flex-1 overflow-y-auto shell:max-h-none"
            versions={snapshots.map((s, idx) => {
              const chip = snapshotChip(s.source, s.triggerType);
              return {
                id: s.id,
                version: s.version,
                takenAt: s.takenAt.toISOString(),
                chipLabel: chip.label,
                chipDashed: chip.dashed,
                state: snapshotState(s),
                isLatest: idx === 0,
                label: s.label ?? null,
                checkpoint: s.checkpoint,
                source: s.source,
                triggerType: s.triggerType,
              };
            })}
            aId={snapA?.id ?? null}
            bId={snapB?.id ?? null}
          />
        ) : (
          <div className="flex-1 px-5 py-10 text-center text-[13px] text-ink-soft">
            No snapshots yet. Run a backfill, or edit this item in Webflow —
            we&rsquo;re watching.
          </div>
        )}

        <footer className="border-t border-line px-5 py-3 text-xs leading-normal text-faint">
          <nav aria-label="History pagination" className="mb-3 flex gap-3 text-accent">
            {historyPage > 1 && <Link href={`?historyPage=${historyPage - 1}`}>Newer</Link>}
            <span className="text-ink-soft">Page {historyPage} · {total} versions</span>
            {historyPage * 100 < total && <Link href={`?historyPage=${historyPage + 1}`}>Older</Link>}
          </nav>
          Click an older version to compare it against the latest, or the
          current version to view its full state.
        </footer>
      </aside>

      {/* Diff pane */}
      <section className="flex min-w-0 flex-1 flex-col bg-paper">
        {deleted && snapB && (
          <div className="flex flex-wrap items-center gap-3 border-b border-dark-line bg-dark px-6 py-3 text-[13px] text-dark-text">
            <span>
              This item was deleted {formatDate(item.deletedAt)}. Restoring
              recreates it as a staged draft.
            </span>
            <div className="ml-auto">
              <RestoreActions
                snapshotId={restoreTarget.id}
                versionLabel={`v${versionNumber.get(restoreTarget.id)}`}
                nextVersion={total + 1}
                recover
                expectedHash={snapshots[0].contentHash}
              />
            </div>
          </div>
        )}

        {snapB ? (
          <>
            <header className="flex flex-wrap items-center gap-x-3.5 gap-y-2 bg-dark px-6 py-3.5 text-dark-text">
              <span className="font-mono text-sm text-white">
                {snapA ? `v${versionNumber.get(snapA.id)} → ` : ""}v
                {versionNumber.get(snapB.id)}
              </span>
              {snapB.label && (
                <span className="rounded bg-white/10 px-1.5 py-px text-[12px] font-medium text-white">
                  {snapB.label}
                </span>
              )}
              {bIsLatest && (
                <span className="rounded bg-white/10 px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-faint">
                  latest
                </span>
              )}
              {snapA && (
                <Link
                  href={`/collections/${collectionId}/items/${itemId}?a=${snapB.id}&b=${snapA.id}&historyPage=${historyPage}`}
                  className="font-mono text-xs text-faint hover:text-white"
                >
                  ⇄ swap
                </Link>
              )}
              <span className="text-[13px] text-faint">
                {single
                  ? `${bIsLatest ? "Current" : "Full"} state · ${stateFields.length} field${stateFields.length === 1 ? "" : "s"}`
                  : snapA
                    ? `${changedCount} field${changedCount === 1 ? "" : "s"} changed · ${unchangedCount} unchanged`
                    : "first version — every field is new"}
              </span>
              {/* Restoring the version you're already looking at is a no-op, so
                  the current-state view drops the restore controls. */}
              {!deleted && !(single && bIsLatest) && (single || changedCount > 0) && (
                <div className="ml-auto">
                  <RestoreActions
                    snapshotId={restoreTarget.id}
                    versionLabel={`v${versionNumber.get(restoreTarget.id)}`}
                    nextVersion={total + 1}
                    expectedHash={snapshots[0].contentHash}
                  />
                </div>
              )}
            </header>
            <div className="min-h-0 flex-1 p-6 shell:overflow-y-auto">
              {single ? (
                <VersionState fields={stateFields} />
              ) : (
                <DiffView diffs={diffs} />
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 py-16">
            <div className="max-w-[300px] text-center">
              <div className="font-mono text-[13px] text-faint">empty</div>
              <div className="mt-2 font-display text-xl font-bold">
                Nothing on the record yet
              </div>
              <p className="mt-2 text-[13px] leading-[1.55] text-ink-soft">
                This item has no snapshots. Run a backfill from the collection,
                or edit it in Webflow to capture the first version.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
