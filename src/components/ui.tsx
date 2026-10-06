/** Mono outline chip — anything machine-generated (sources, event types). */
export function Chip({
  children,
  dashed = false,
  className = "",
}: {
  children: React.ReactNode;
  dashed?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-px font-mono text-[11px] text-ink-soft ${
        dashed ? "border-dashed border-line-strong" : "border-line"
      } ${className}`}
    >
      {children}
    </span>
  );
}

/** Status pill — Plex Sans 600, tones from itemStatus(). */
export function StatusPill({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

/** The `latest` marker on version rows. */
export function LatestTag() {
  return (
    <span className="inline-flex shrink-0 items-center rounded border border-accent-line bg-surface px-1.5 font-mono text-[10px] text-accent">
      latest
    </span>
  );
}

/** Inline async spinner — per the token sheet, never a toast. */
export function Spinner({ onDark = false }: { onDark?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-3 shrink-0 animate-spin rounded-full border-2 ${
        onDark ? "border-white/40 border-t-white" : "border-line border-t-accent"
      }`}
    />
  );
}
