const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function utcParts(d: Date | number) {
  const date = typeof d === "number" ? new Date(d) : d;
  return {
    month: MONTHS[date.getUTCMonth()],
    day: date.getUTCDate(),
    year: date.getUTCFullYear(),
    time: `${String(date.getUTCHours()).padStart(2, "0")}:${String(
      date.getUTCMinutes(),
    ).padStart(2, "0")}`,
  };
}

/** List format — `Jul 11 · 20:06` (UTC, mono contexts) */
export function formatDate(d: Date | number | null | undefined): string {
  if (d === null || d === undefined) return "—";
  const p = utcParts(d);
  return `${p.month} ${p.day} · ${p.time}`;
}

/** Header/audit format — `Jul 11, 2026 · 20:06 UTC` */
export function formatDateLong(d: Date | number | null | undefined): string {
  if (d === null || d === undefined) return "—";
  const p = utcParts(d);
  return `${p.month} ${p.day}, ${p.year} · ${p.time} UTC`;
}

/** Status pill tone — red/green are reserved for the diff, never status. */
export function itemStatus(item: {
  isDraft: boolean | null;
  isArchived: boolean | null;
  lastPublishedAt: Date | null;
  deletedAt?: Date | null;
}): { label: string; className: string } {
  if (item.deletedAt) {
    return { label: "Deleted", className: "bg-dark text-dark-text border-dark-line" };
  }
  if (item.isArchived) {
    return { label: "Archived", className: "bg-surface text-faint border-line" };
  }
  if (item.lastPublishedAt && item.isDraft) {
    return {
      label: "Staged changes",
      className: "bg-warn-bg text-warn border-warn-line",
    };
  }
  if (item.lastPublishedAt) {
    return {
      label: "Published",
      className: "bg-selected text-accent-deep border-accent-line",
    };
  }
  if (item.isDraft === false) {
    return {
      label: "Staged changes",
      className: "bg-warn-bg text-warn border-warn-line",
    };
  }
  return { label: "Draft", className: "bg-sunken text-ink-soft border-line" };
}

const WEBHOOK_PREFIX = "collection_item_";

/** Mono outline chip for an audit event. Restore chips are dashed — "synthetic". */
export function eventChip(type: string): { label: string; dashed: boolean } {
  if (type.startsWith(WEBHOOK_PREFIX)) {
    return { label: `webhook · ${type.slice(WEBHOOK_PREFIX.length)}`, dashed: false };
  }
  return { label: type, dashed: type === "restore" };
}

/** Mono outline chip for a snapshot's capture source. */
export function snapshotChip(
  source: string,
  triggerType: string | null,
): { label: string; dashed: boolean } {
  if (source === "webhook") {
    const trigger = triggerType?.replace(WEBHOOK_PREFIX, "") ?? "event";
    return { label: `webhook · ${trigger}`, dashed: false };
  }
  return { label: source, dashed: source === "restore" };
}

/** One-word publish state for a snapshot row: draft / staged / live. */
export function snapshotState(s: {
  isDraft: boolean | null;
  triggerType?: string | null;
}): string {
  if (s.triggerType === `${WEBHOOK_PREFIX}published`) return "live";
  if (s.isDraft) return "draft";
  return "staged";
}
