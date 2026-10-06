import Link from "next/link";
import { getDashboardData, getEvents } from "@/lib/queries";
import { formatDate, eventChip } from "@/lib/format";
import { SetupPanel } from "@/components/SetupPanel";
import { BackfillButton } from "@/components/BackfillButton";
import { SyncCollectionsButton } from "@/components/SyncCollectionsButton";
import { Chip } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [{ collections, webhooksRegistered }, recentEvents] = await Promise.all([
    getDashboardData(),
    getEvents({ limit: 6 }),
  ]);
  const needsSetup = collections.length === 0 || !webhooksRegistered;

  return (
    <div className="px-6 py-7 shell:px-9 shell:py-8">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="font-display text-[26px] font-bold">Collections</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Every change is snapshotted the moment it happens. Browse, compare,
            restore.
          </p>
        </div>
        <SyncCollectionsButton />
      </div>

      {needsSetup && (
        <SetupPanel
          collectionsFound={collections.length}
          webhooksRegistered={webhooksRegistered}
        />
      )}

      {collections.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 shell:grid-cols-3">
          {collections.map((c) => (
            <div
              key={c.id}
              className="rounded-[10px] border border-line bg-surface p-5 transition-colors hover:border-line-strong"
            >
              <Link
                href={`/collections/${c.id}`}
                className="font-display text-[17px] font-bold text-accent hover:text-accent-deep"
              >
                {c.displayName}
              </Link>
              <div className="mt-0.5 truncate font-mono text-xs text-faint">
                /{c.slug}
              </div>
              <div className="mt-4 flex gap-7">
                <div>
                  <div className="font-mono text-[11px] text-faint">items</div>
                  <div className="mt-0.5 text-[19px] font-semibold">
                    {c.itemCount || "—"}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[11px] text-faint">
                    snapshots
                  </div>
                  <div className="mt-0.5 text-[19px] font-semibold">
                    {c.snapshotCount}
                  </div>
                </div>
              </div>
              <BackfillButton
                collectionId={c.id}
                variant="card"
                syncedLabel={c.lastSyncedAt ? formatDate(c.lastSyncedAt) : null}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-[10px] border border-line bg-surface px-6 py-14 text-center text-[13px] text-ink-soft">
          No collections yet — run setup to sync your site.
        </div>
      )}

      {recentEvents.length > 0 && (
        <section className="mt-7">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Recent activity</h2>
            <Link
              href="/activity"
              className="text-[13px] text-accent hover:text-accent-deep"
            >
              View all →
            </Link>
          </div>
          <ul className="mt-2.5 overflow-hidden rounded-[10px] border border-line bg-surface">
            {recentEvents.map(({ event: e, itemName, collectionName }) => {
              const chip = eventChip(e.type);
              return (
                <li
                  key={e.id}
                  className="flex items-center gap-4 border-b border-line px-5 py-[11px] last:border-b-0"
                >
                  <span className="w-[110px] shrink-0 font-mono text-xs text-ink-soft">
                    {formatDate(e.ts)}
                  </span>
                  <Chip dashed={chip.dashed}>{chip.label}</Chip>
                  <span className="min-w-0 truncate text-[13px]">
                    {e.summary ?? "—"}
                    {e.itemId && e.collectionId ? (
                      <>
                        {" — "}
                        <Link
                          href={`/collections/${e.collectionId}/items/${e.itemId}`}
                          className="text-accent hover:text-accent-deep"
                        >
                          {collectionName && itemName
                            ? `${collectionName} · ${itemName}`
                            : "view item"}
                        </Link>
                      </>
                    ) : e.collectionId && collectionName ? (
                      <>
                        {" — "}
                        <Link
                          href={`/collections/${e.collectionId}`}
                          className="text-accent hover:text-accent-deep"
                        >
                          {collectionName}
                        </Link>
                      </>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
