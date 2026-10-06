import type { ItemPreviews, PreviewTarget } from "@/lib/preview-urls";

const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] border border-line bg-surface px-3 py-2 text-[13px] font-semibold text-ink transition-colors hover:border-line-strong hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

function ExternalIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" /></svg>;
}

function PreviewLink({ target, children }: { target: PreviewTarget; children: React.ReactNode }) {
  return <a className={button} href={target.url} target="_blank" rel="noopener noreferrer" title={`${target.url} (opens in a new tab)`}>
    {children}<ExternalIcon /><span className="sr-only"> (opens in a new tab)</span>
  </a>;
}

export function ItemPreviewLinks({ previews, unpublished }: { previews: ItemPreviews; unpublished: boolean }) {
  return <section aria-label="Item preview links" className="mt-3">
    <div className="flex flex-wrap items-start gap-2">
      {previews.live.length === 1 ? <PreviewLink target={previews.live[0]}>View live</PreviewLink>
        : previews.live.length > 1 ? <details className="relative">
          <summary className={`${button} cursor-pointer list-none`}>View live <span aria-hidden="true">▾</span></summary>
          <ul className="absolute left-0 top-full z-20 mt-1 min-w-56 max-w-72 rounded-[7px] border border-line bg-surface p-1 shadow-overlay">
            {previews.live.map(target => <li key={target.url}><a href={target.url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 break-all rounded px-3 py-2 text-xs text-accent hover:bg-paper focus-visible:outline-accent">{target.hostname}<ExternalIcon /><span className="sr-only"> (opens in a new tab)</span></a></li>)}
          </ul>
        </details>
        : <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-[7px] border border-line bg-sunken px-3 py-2 text-[13px] text-faint">View live</span>}
      {previews.staging ? <PreviewLink target={previews.staging}>View staging</PreviewLink>
        : <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-[7px] border border-line bg-sunken px-3 py-2 text-[13px] text-faint">View staging</span>}
    </div>
    <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">Opens the page published to each environment, not this saved version.{unpublished ? " Draft, archived, or deleted items may not be available there." : ""}</p>
    {previews.notices.map(notice => <p key={notice} className="mt-1 break-words text-[11px] leading-relaxed text-ink-soft">{notice}</p>)}
  </section>;
}
