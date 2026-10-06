"use client";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6 shell:min-h-full">
      <div className="max-w-[300px] text-center">
        <div className="font-mono text-[13px] text-faint">error</div>
        <h1 className="mt-2 font-display text-xl font-bold">
          Something broke — your history didn&rsquo;t
        </h1>
        <p className="mt-2 text-[13px] leading-[1.55] text-ink-soft">
          Snapshots are safe in storage. Reload, and if this keeps happening,
          check the Worker logs.
        </p>
        <button
          onClick={reset}
          className="mt-3.5 rounded-[7px] bg-accent px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-deep"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
