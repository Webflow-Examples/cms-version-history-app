import sanitizeHtml from "sanitize-html";
import type { FieldDiff, DiffSegment } from "@/lib/diff";

const SANITIZE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "figure", "figcaption"]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ["src", "alt", "width", "height"],
  },
};

export function DiffView({ diffs }: { diffs: FieldDiff[] }) {
  const changed = diffs.filter((d) => d.status !== "unchanged");
  const unchanged = diffs.filter((d) => d.status === "unchanged");

  if (changed.length === 0) {
    return (
      <p className="rounded-[10px] border border-line bg-surface px-6 py-10 text-center text-[13px] text-ink-soft">
        These two versions are identical — nothing changed between them.
      </p>
    );
  }

  return (
    <div>
      {/* CSS-only "show all" so the diff stays fully server-rendered */}
      <input id="show-unchanged" type="checkbox" className="peer sr-only" />
      <div className="flex flex-col gap-3.5">
        {changed.map((d) => (
          <FieldCard key={d.slug} diff={d} />
        ))}
      </div>
      {unchanged.length > 0 && (
        <>
          <div className="mt-3.5 hidden flex-col gap-3.5 peer-checked:flex">
            {unchanged.map((d) => (
              <FieldCard key={d.slug} diff={d} />
            ))}
          </div>
          <label
            htmlFor="show-unchanged"
            className="mt-3.5 block cursor-pointer text-center text-[13px] text-faint peer-checked:hidden"
          >
            {unchanged.length} unchanged field
            {unchanged.length === 1 ? "" : "s"} hidden ·{" "}
            <span className="text-accent">show all</span>
          </label>
          <label
            htmlFor="show-unchanged"
            className="mt-3.5 hidden cursor-pointer text-center text-[13px] text-faint peer-checked:block"
          >
            <span className="text-accent">hide unchanged fields</span>
          </label>
        </>
      )}
    </div>
  );
}

/**
 * The item's full content at a single version — no diff, every field rendered
 * neutrally. This is what you get by clicking the current version on its own.
 */
export function VersionState({ fields }: { fields: FieldDiff[] }) {
  if (fields.length === 0) {
    return (
      <p className="rounded-[10px] border border-line bg-surface px-6 py-10 text-center text-[13px] text-ink-soft">
        This version has no field data.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3.5">
      {fields.map((f) => (
        <FieldCard key={f.slug} diff={f} hideStatus />
      ))}
    </div>
  );
}

function FieldCard({ diff, hideStatus }: { diff: FieldDiff; hideStatus?: boolean }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-line bg-surface">
      <div className="flex items-center gap-2.5 border-b border-line px-4.5 py-2.5">
        <span className="text-sm font-semibold">{diff.displayName}</span>
        <span className="font-mono text-[11px] text-faint">
          {diff.fieldType.toLowerCase()}
        </span>
        {!hideStatus && <StatusTag status={diff.status} />}
      </div>
      <div className="px-4.5 py-3.5 text-[15px] leading-[1.65]">
        <FieldDiffBody diff={diff} />
      </div>
    </div>
  );
}

function StatusTag({ status }: { status: FieldDiff["status"] }) {
  const styles: Record<FieldDiff["status"], string> = {
    changed: "border border-line text-ink-soft",
    added: "bg-added-bg text-added-chip",
    removed: "bg-removed-bg text-removed-chip",
    unchanged: "border border-line text-faint",
  };
  return (
    <span
      className={`ml-auto rounded px-1.5 py-px font-mono text-[11px] ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function FieldDiffBody({ diff }: { diff: FieldDiff }) {
  // Image-ish fields get the before/after pane treatment instead of a JSON diff
  if (
    diff.status === "changed" &&
    (isImageRef(diff.before) || isImageRef(diff.after))
  ) {
    return (
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        <ValueBlock value={diff.before} kind={diff.kind} tone="removed" label="before" />
        <ValueBlock value={diff.after} kind={diff.kind} tone="added" label="after" />
      </div>
    );
  }

  if (diff.status === "added") {
    return <ValueBlock value={diff.after} kind={diff.kind} tone="added" />;
  }
  if (diff.status === "removed") {
    return <ValueBlock value={diff.before} kind={diff.kind} tone="removed" />;
  }
  if (diff.status === "unchanged") {
    return <ValueBlock value={diff.after} kind={diff.kind} tone="neutral" />;
  }

  return (
    <div className="space-y-3">
      {diff.segments ? (
        <Segments segments={diff.segments} mono={diff.kind === "value"} />
      ) : (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <ValueBlock value={diff.before} kind={diff.kind} tone="removed" label="before" />
          <ValueBlock value={diff.after} kind={diff.kind} tone="added" label="after" />
        </div>
      )}

      {diff.kind === "richtext" && (
        <details>
          <summary className="cursor-pointer text-[13px] text-accent hover:text-accent-deep">
            Show rendered before / after
          </summary>
          <div className="mt-2.5 grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <RenderedHtml html={String(diff.before ?? "")} label="before" tone="removed" />
            <RenderedHtml html={String(diff.after ?? "")} label="after" tone="added" />
          </div>
        </details>
      )}
    </div>
  );
}

function Segments({ segments, mono }: { segments: DiffSegment[]; mono: boolean }) {
  return (
    <p
      className={`whitespace-pre-wrap ${mono ? "font-mono text-xs leading-relaxed" : ""}`}
    >
      {segments.map((s, i) => {
        if (s.added) {
          return (
            <span key={i} className="rounded-[3px] bg-added-bg px-[3px] text-added">
              {s.value}
            </span>
          );
        }
        if (s.removed) {
          return (
            <span
              key={i}
              className="rounded-[3px] bg-removed-bg px-[3px] text-removed line-through"
            >
              {s.value}
            </span>
          );
        }
        return <span key={i}>{s.value}</span>;
      })}
    </p>
  );
}

function isImageRef(v: unknown): v is { url: string; alt?: string | null } {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { url?: unknown }).url === "string" &&
    /^https?:\/\//.test((v as { url: string }).url)
  );
}

const TONE_LABEL: Record<string, string> = {
  removed: "text-removed-chip",
  added: "text-added-chip",
  neutral: "text-faint",
};

function ValueBlock({
  value,
  kind,
  tone,
  label,
}: {
  value: unknown;
  kind: FieldDiff["kind"];
  tone: "added" | "removed" | "neutral";
  label?: string;
}) {
  const labelEl = label ? (
    <p className={`mb-1.5 font-mono text-[11px] ${TONE_LABEL[tone]}`}>{label}</p>
  ) : null;

  if (isImageRef(value)) {
    const filename = value.url.split("/").pop()?.split("?")[0] ?? value.url;
    return (
      <div>
        {labelEl}
        {/* Remote CMS assets of unknown dimensions — plain img keeps this simple */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value.url}
          alt={value.alt ?? filename}
          className="h-24 w-full rounded-[7px] border border-line bg-sunken object-cover"
        />
        <p className="mt-1.5 truncate font-mono text-[11px] text-faint">
          {filename}
        </p>
      </div>
    );
  }

  const text =
    value === undefined || value === null
      ? "(empty)"
      : typeof value === "string"
        ? value
        : JSON.stringify(value, null, 2);

  return (
    <div>
      {labelEl}
      {kind === "richtext" && typeof value === "string" ? (
        <RenderedHtml html={value} tone={tone} />
      ) : (
        <pre
          className={`whitespace-pre-wrap rounded-[7px] px-3 py-2.5 font-sans text-sm ${
            tone === "added"
              ? "bg-added-bg/50"
              : tone === "removed"
                ? "bg-removed-bg/50"
                : "bg-sunken"
          }`}
        >
          {text}
        </pre>
      )}
    </div>
  );
}

function RenderedHtml({
  html,
  label,
  tone,
}: {
  html: string;
  label?: string;
  tone: "added" | "removed" | "neutral";
}) {
  return (
    <div>
      {label && (
        <p className={`mb-1.5 font-mono text-[11px] ${TONE_LABEL[tone]}`}>
          {label}
        </p>
      )}
      <div className="rounded-[7px] border border-line bg-surface p-3.5">
        <div
          className="text-sm leading-relaxed [&_a]:text-accent [&_a]:underline [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_img]:max-w-full [&_li]:ml-4 [&_li]:list-disc [&_p]:my-2"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(html, SANITIZE_OPTS) }}
        />
      </div>
    </div>
  );
}
