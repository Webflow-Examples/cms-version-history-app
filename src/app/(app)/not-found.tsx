import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6 shell:min-h-full">
      <div className="max-w-[300px] text-center">
        <div className="font-mono text-[13px] text-faint">404</div>
        <h1 className="mt-2 font-display text-xl font-bold">
          No trace of that item
        </h1>
        <p className="mt-2 text-[13px] leading-[1.55] text-ink-soft">
          It may never have existed, or the link is stale. If it was deleted,
          its snapshots are in the collection&rsquo;s Deleted items.
        </p>
        <Link
          href="/"
          className="mt-3.5 inline-block text-[13px] font-semibold text-accent hover:text-accent-deep"
        >
          ← Back to overview
        </Link>
      </div>
    </div>
  );
}
