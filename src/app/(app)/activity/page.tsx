import Link from "next/link";
import { getEvents, getEventTypes } from "@/lib/queries";
import { formatDateLong, eventChip } from "@/lib/format";
import { Chip } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const [events, types] = await Promise.all([
    getEvents({ type: type || undefined }),
    getEventTypes(),
  ]);

  return (
    <div className="px-6 py-7 shell:px-9 shell:py-8">
      <h1 className="font-display text-[26px] font-bold">Activity</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Meaningful CMS changes, restores, and app operations. Delivery status is in History & health.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link
          href="/activity"
          className={
            !type
              ? "rounded-full border border-ink bg-ink px-3.5 py-[5px] text-[13px] font-semibold text-white"
              : "rounded-full border border-line bg-surface px-3.5 py-[5px] text-[13px] font-semibold text-ink-soft transition-colors hover:border-line-strong"
          }
        >
          All
        </Link>
        {types.map((t) => (
          <Link
            key={t}
            href={`/activity?type=${encodeURIComponent(t)}`}
            className={
              type === t
                ? "rounded-full border border-ink bg-ink px-3 py-[5px] font-mono text-xs text-white"
                : "rounded-full border border-line bg-surface px-3 py-[5px] font-mono text-xs text-ink-soft transition-colors hover:border-line-strong"
            }
          >
            {t}
          </Link>
        ))}
        <span className="ml-auto font-mono text-xs text-faint">
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
      </div>

      <ul className="mt-3.5 overflow-hidden rounded-[10px] border border-line bg-surface">
        {events.map(({ event: e, itemName, collectionName }) => {
          const chip = eventChip(e.type);
          return (
            <li
              key={e.id}
              className="flex items-center gap-4 border-b border-line px-5 py-3 last:border-b-0"
            >
              <span className="hidden w-[190px] shrink-0 font-mono text-xs text-ink-soft sm:block">
                {formatDateLong(e.ts)}
              </span>
              <Chip dashed={chip.dashed}>{chip.label}</Chip>
              <span className="min-w-0 flex-1 truncate text-[13px]">
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
              {e.actor && (
                <span className="hidden shrink-0 font-mono text-[11px] text-faint md:block">
                  {e.actor}
                </span>
              )}
            </li>
          );
        })}
        {events.length === 0 && (
          <li className="px-6 py-14 text-center text-[13px] text-ink-soft">
            {type === "restore"
              ? "No restore events yet — nothing has needed rescuing."
              : type
                ? `No ${type} events yet.`
                : "Activity will appear here as soon as something changes in the CMS."}
          </li>
        )}
      </ul>
    </div>
  );
}
