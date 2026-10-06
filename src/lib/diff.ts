import { diffWords, diffJson } from "diff";
import type { SnapshotContent } from "./snapshots";
import type { WebflowField } from "./webflow";
import { canonicalJson } from "./snapshots";

export interface DiffSegment {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export interface FieldDiff {
  slug: string;
  displayName: string;
  fieldType: string;
  status: "added" | "removed" | "changed" | "unchanged";
  // How the UI should render this field
  kind: "text" | "richtext" | "value";
  before: unknown;
  after: unknown;
  // Word-level segments for text-ish fields (rich text diffed on stripped text)
  segments?: DiffSegment[];
}

const META_FIELDS: Array<{ key: keyof SnapshotContent; label: string }> = [
  { key: "isDraft", label: "Draft" },
  { key: "isArchived", label: "Archived" },
];

export function diffSnapshots(
  before: SnapshotContent | null,
  after: SnapshotContent,
  schemaFields: WebflowField[],
): FieldDiff[] {
  const fieldMeta = new Map(schemaFields.map((f) => [f.slug, f]));
  const slugs = new Set([
    ...Object.keys(before?.fieldData ?? {}),
    ...Object.keys(after.fieldData),
  ]);

  const diffs: FieldDiff[] = [];

  for (const meta of META_FIELDS) {
    const b = before?.[meta.key] ?? null;
    const a = after[meta.key] ?? null;
    if (before !== null && b !== a) {
      diffs.push({
        slug: String(meta.key),
        displayName: meta.label,
        fieldType: "Boolean",
        status: "changed",
        kind: "value",
        before: b,
        after: a,
      });
    }
  }

  for (const slug of [...slugs].sort()) {
    const b = before?.fieldData?.[slug];
    const a = after.fieldData[slug];
    const meta = fieldMeta.get(slug);
    const fieldType = meta?.type ?? inferType(a ?? b);
    const displayName = meta?.displayName ?? slug;
    const kind = kindFor(fieldType, a ?? b);

    let status: FieldDiff["status"];
    if (before === null) status = "added";
    else if (b === undefined && a !== undefined) status = "added";
    else if (b !== undefined && a === undefined) status = "removed";
    else if (canonicalJson(b) !== canonicalJson(a)) status = "changed";
    else status = "unchanged";

    const diff: FieldDiff = { slug, displayName, fieldType, status, kind, before: b, after: a };

    if (status === "changed") {
      if (kind === "text") {
        diff.segments = diffWords(asText(b), asText(a));
      } else if (kind === "richtext") {
        diff.segments = diffWords(stripHtml(asText(b)), stripHtml(asText(a)));
      } else if (isObjectLike(a) || isObjectLike(b)) {
        diff.segments = diffJson(
          (b ?? {}) as object,
          (a ?? {}) as object,
        ).map((c) => ({ value: c.value, added: c.added, removed: c.removed }));
      }
    }

    diffs.push(diff);
  }

  const order = { changed: 0, added: 1, removed: 2, unchanged: 3 };
  return diffs.sort((x, y) => order[x.status] - order[y.status]);
}

/**
 * Every field of a single snapshot, as a flat list for the state view — the
 * item's content as it stood at that version, with nothing to compare against.
 * Reuses FieldDiff so the same field renderers apply; status is always
 * "unchanged" (rendered neutrally). Ordered by schema, then any stray keys.
 */
export function snapshotFields(
  content: SnapshotContent,
  schemaFields: WebflowField[],
): FieldDiff[] {
  const fieldMeta = new Map(schemaFields.map((f) => [f.slug, f]));
  const seen = new Set<string>();
  const out: FieldDiff[] = [];

  const push = (slug: string) => {
    if (seen.has(slug) || !(slug in content.fieldData)) return;
    seen.add(slug);
    const value = content.fieldData[slug];
    const meta = fieldMeta.get(slug);
    const fieldType = meta?.type ?? inferType(value);
    out.push({
      slug,
      displayName: meta?.displayName ?? slug,
      fieldType,
      status: "unchanged",
      kind: kindFor(fieldType, value),
      before: value,
      after: value,
    });
  };

  for (const f of schemaFields) push(f.slug);
  for (const slug of Object.keys(content.fieldData).sort()) push(slug);
  return out;
}

export function summarizeDiff(diffs: FieldDiff[]): string {
  const changed = diffs.filter((d) => d.status !== "unchanged");
  if (changed.length === 0) return "No changes";
  return changed
    .slice(0, 5)
    .map((d) => `${d.displayName} (${d.status})`)
    .join(", ") + (changed.length > 5 ? ` +${changed.length - 5} more` : "");
}

function kindFor(fieldType: string, sample: unknown): FieldDiff["kind"] {
  const t = fieldType.toLowerCase();
  if (t === "richtext") return "richtext";
  if (
    ["plaintext", "email", "phone", "link", "color", "option", "video"].includes(t) ||
    typeof sample === "string"
  ) {
    // A plain string that carries markup still deserves rich-text treatment
    if (typeof sample === "string" && /<[a-z][^>]*>/i.test(sample)) return "richtext";
    return "text";
  }
  return "value";
}

function inferType(v: unknown): string {
  if (typeof v === "string") return /<[a-z][^>]*>/i.test(v) ? "RichText" : "PlainText";
  if (typeof v === "number") return "Number";
  if (typeof v === "boolean") return "Switch";
  if (Array.isArray(v)) return "MultiReference";
  if (isObjectLike(v)) return "Object";
  return "Unknown";
}

function asText(v: unknown): string {
  if (v === undefined || v === null) return "";
  return typeof v === "string" ? v : JSON.stringify(v, null, 2);
}

export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isObjectLike(v: unknown): boolean {
  return v !== null && typeof v === "object";
}
