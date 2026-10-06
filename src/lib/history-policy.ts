export interface HistoryPolicy {
  mode: "smart" | "all" | "milestones";
  sessionMinutes: number;
  transitions: boolean;
  watchedFields: string[];
  customField: string;
  customValue: string;
}
export const DEFAULT_POLICY: HistoryPolicy = {
  mode: "smart", sessionMinutes: 5, transitions: true,
  watchedFields: [], customField: "", customValue: "",
};

export function parsePolicy(value: unknown): HistoryPolicy {
  if (!value || typeof value !== "object") throw new Error("Invalid history settings");
  const p = value as HistoryPolicy;
  if (!["smart", "all", "milestones"].includes(p.mode) ||
      !Number.isInteger(p.sessionMinutes) || p.sessionMinutes < 1 || p.sessionMinutes > 60 ||
      typeof p.transitions !== "boolean" || !Array.isArray(p.watchedFields) ||
      p.watchedFields.length > 50 || p.watchedFields.some(f => typeof f !== "string" || f.length > 100) ||
      typeof p.customField !== "string" || p.customField.length > 100 ||
      typeof p.customValue !== "string" || p.customValue.length > 200) throw new Error("Invalid history settings");
  return { mode: p.mode, sessionMinutes: p.sessionMinutes, transitions: p.transitions,
    watchedFields: [...new Set(p.watchedFields.filter(Boolean))],
    customField: p.customField.trim(), customValue: p.customValue.trim() };
}

interface State { fieldData: Record<string, unknown>; isDraft?: boolean | null; isArchived?: boolean | null }
export function checkpointReason(previous: State | null, next: State, trigger: string | undefined, p: HistoryPolicy): string | null {
  // Lifecycle milestones exist even if content hashes match.
  if (trigger === "collection_item_published") return "Published";
  if (trigger === "collection_item_unpublished") return "Unpublished";
  if (!previous) return "Baseline";
  if (p.transitions) {
    if (next.isArchived != null && previous.isArchived != null && next.isArchived !== previous.isArchived)
      return next.isArchived ? "Archived" : "Unarchived";
    if (next.isDraft != null && previous.isDraft != null && next.isDraft !== previous.isDraft)
      return next.isDraft ? "Moved to draft" : "Ready to publish";
  }
  if (p.customField && String(next.fieldData[p.customField] ?? "") === p.customValue &&
      String(previous.fieldData[p.customField] ?? "") !== p.customValue) return `${p.customField} → ${p.customValue}`;
  if (p.watchedFields.some(f => JSON.stringify(previous.fieldData[f]) !== JSON.stringify(next.fieldData[f])))
    return "Watched fields changed";
  return null;
}

export interface TimelineEntry { id: number; takenAt: string; label: string | null; checkpoint?: string | null; source?: string; triggerType?: string | null }
export function groupHistory<T extends TimelineEntry>(versions: T[], policy: HistoryPolicy): T[][] {
  if (policy.mode === "all") return versions.map(v => [v]);
  const groups: T[][] = [];
  for (const v of versions) {
    const important = Boolean(v.label || v.checkpoint || v.source === "restore" || v.source === "manual" ||
      ["collection_item_published", "collection_item_unpublished"].includes(v.triggerType ?? ""));
    const last = groups.at(-1);
    const previous = last?.at(-1);
    const previousImportant = previous && Boolean(previous.label || previous.checkpoint || previous.source === "restore" || previous.source === "manual" ||
      ["collection_item_published", "collection_item_unpublished"].includes(previous.triggerType ?? ""));
    if (!important && policy.mode === "milestones" && groups.length > 0) continue;
    if (!important && !previousImportant && previous &&
        Date.parse(previous.takenAt) - Date.parse(v.takenAt) <= policy.sessionMinutes * 60_000) last!.push(v);
    else groups.push([v]);
  }
  return groups;
}
