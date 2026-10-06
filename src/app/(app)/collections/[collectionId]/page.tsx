import Link from "next/link";
import { notFound } from "next/navigation";
import { getCollectionWithItems } from "@/lib/queries";
import { formatDate, itemStatus } from "@/lib/format";
import { BackfillButton } from "@/components/BackfillButton";
import { ItemsTable } from "@/components/ItemsTable";
import { StatusPill } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ collectionId: string }>;
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { collectionId } = await params;
  const query = await searchParams;
  const page = Math.max(1, Math.min(100000, Math.floor(Number(query.page) || 1)));
  const q = (query.q ?? "").slice(0, 100);
  const data = await getCollectionWithItems(collectionId, page, q);
  if (!data) notFound();
  const { collection, items, deletedItems } = data;

  const totalSnapshots =
    items.reduce((n, r) => n + r.snapshotCount, 0) +
    deletedItems.reduce((n, r) => n + r.snapshotCount, 0);

  return (
    <div className="px-6 py-7 shell:px-9 shell:py-8">
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
        <h1 className="font-display text-[26px] font-bold">
          {collection.displayName}
        </h1>
        <span className="font-mono text-xs text-faint">
          /{collection.slug} · {items.length} item
          {items.length === 1 ? "" : "s"} tracked · {totalSnapshots} snapshot
          {totalSnapshots === 1 ? "" : "s"} on this page
        </span>
        <div className="ml-auto">
          <BackfillButton collectionId={collection.id} variant="header" />
        </div>
      </div>

      <ItemsTable
        key={q}
        initialQuery={q}
        collectionId={collection.id}
        rows={items.map(({ item, snapshotCount }) => {
          const status = itemStatus(item);
          return {
            id: item.id,
            name: item.name ?? item.id,
            slug: item.slug,
            statusLabel: status.label,
            statusClass: status.className,
            versions: snapshotCount,
            lastChange: formatDate(item.updatedAt),
          };
        })}
      />
      <nav aria-label="Collection pagination" className="mt-4 flex gap-4 text-sm">
        {page > 1 && <Link className="text-accent" href={`?page=${page - 1}&q=${encodeURIComponent(q)}`}>Previous</Link>}
        <span>Page {page} · {data.total} matching items, including deleted</span>
        {page * 100 < data.total && <Link className="text-accent" href={`?page=${page + 1}&q=${encodeURIComponent(q)}`}>Next</Link>}
      </nav>

      {deletedItems.length > 0 && (
        <section className="mt-6 overflow-hidden rounded-[10px] border border-line bg-surface">
          <div className="flex flex-wrap items-baseline gap-3 bg-dark px-5 py-3">
            <h2 className="text-sm font-semibold text-white">Deleted items</h2>
            <span className="text-[13px] text-faint">
              Snapshots retained — everything here is recoverable.
            </span>
            <span className="ml-auto font-mono text-[11px] text-faint">
              {deletedItems.length} item{deletedItems.length === 1 ? "" : "s"}
            </span>
          </div>
          {deletedItems.map(({ item, snapshotCount }) => {
            const status = itemStatus(item);
            return (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/collections/${collection.id}/items/${item.id}`}
                    className="block truncate text-sm font-semibold text-accent hover:text-accent-deep"
                  >
                    {item.name ?? item.id}
                  </Link>
                  {item.slug && (
                    <div className="truncate font-mono text-[11px] text-faint">
                      /{item.slug}
                    </div>
                  )}
                </div>
                <StatusPill label={status.label} className={status.className} />
                <span className="font-mono text-xs text-ink-soft">
                  deleted {formatDate(item.deletedAt)}
                </span>
                <span className="font-mono text-xs text-ink-soft">
                  {snapshotCount} version{snapshotCount === 1 ? "" : "s"}
                </span>
                <Link
                  href={`/collections/${collection.id}/items/${item.id}`}
                  className="rounded-[7px] border border-line bg-surface px-3 py-[5px] text-xs font-semibold text-ink transition-colors hover:border-line-strong"
                >
                  Recover…
                </Link>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
