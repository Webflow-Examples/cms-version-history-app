import { describe, it, expect } from "vitest";
import { DEFAULT_POLICY, checkpointReason, groupHistory, parsePolicy } from "../src/lib/history-policy";
import { DatabaseSync } from "node:sqlite";
import { BOOTSTRAP_STATEMENTS, MIGRATIONS } from "../src/db/bootstrap.sql";

describe("checkpoint semantics", () => {
  const draft = { fieldData: { status: "Draft", name: "One" }, isDraft: true, isArchived: false };
  it("fires only on entry into a custom status", () => {
    const p = { ...DEFAULT_POLICY, customField: "status", customValue: "Approved" };
    const approved = { ...draft, fieldData: { ...draft.fieldData, status: "Approved" } };
    expect(checkpointReason(draft, approved, "collection_item_changed", p)).toBe("status → Approved");
    expect(checkpointReason(approved, { ...approved, fieldData: { ...approved.fieldData, name: "Two" } }, "collection_item_changed", p)).toBeNull();
  });
  it("marks publication with unchanged content and treats initial state as a baseline", () => {
    expect(checkpointReason(draft, draft, "collection_item_published", DEFAULT_POLICY)).toBe("Published");
    expect(checkpointReason(null, draft, "collection_item_changed", DEFAULT_POLICY)).toBe("Baseline");
  });
  it("does not infer a transition from unknown flags", () => {
    expect(checkpointReason({ fieldData: {} }, draft, undefined, DEFAULT_POLICY)).toBeNull();
    expect(checkpointReason(draft, { ...draft, isDraft: false }, undefined, DEFAULT_POLICY)).toBe("Ready to publish");
  });
  it("groups only neighboring ordinary edits, preserving milestones and named versions", () => {
    const rows = [
      { id: 5, takenAt: "2026-01-01T00:10:00Z", label: null },
      { id: 4, takenAt: "2026-01-01T00:09:00Z", label: null },
      { id: 3, takenAt: "2026-01-01T00:08:00Z", label: null, checkpoint: "Published" },
      { id: 2, takenAt: "2026-01-01T00:07:00Z", label: "Launch" },
      { id: 1, takenAt: "2026-01-01T00:00:00Z", label: null },
    ];
    expect(groupHistory(rows, DEFAULT_POLICY).map(g => g.map(v => v.id))).toEqual([[5, 4], [3], [2], [1]]);
    expect(groupHistory(rows, { ...DEFAULT_POLICY, mode: "milestones" }).map(g => g[0].id)).toEqual([5, 3, 2]);
    expect(groupHistory(rows, { ...DEFAULT_POLICY, mode: "all" })).toHaveLength(5);
  });
  it("validates policy bounds", () => {
    expect(() => parsePolicy({ ...DEFAULT_POLICY, sessionMinutes: 0 })).toThrow();
    expect(() => parsePolicy({ ...DEFAULT_POLICY, watchedFields: [5] })).toThrow();
  });
});

describe("non-destructive database migration", () => {
  it("upgrades a v2 database with existing history and enforces operation uniqueness", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE items(id TEXT PRIMARY KEY); CREATE TABLE snapshots(id INTEGER PRIMARY KEY, label TEXT); CREATE TABLE events(id INTEGER PRIMARY KEY); INSERT INTO snapshots VALUES(1, 'Launch');`);
    for (const stmt of MIGRATIONS.find(m => m.version === 3)!.statements) db.exec(stmt);
    expect(db.prepare("SELECT label FROM snapshots WHERE id=1").get()?.label).toBe("Launch");
    db.exec("UPDATE snapshots SET operation_key='delivery-1' WHERE id=1");
    expect(() => db.exec("INSERT INTO snapshots(id,operation_key) VALUES(2,'delivery-1')")).toThrow();
    db.close();
  });
  it("bootstraps the complete schema twice without deleting data", () => {
    const db = new DatabaseSync(":memory:");
    for (let i = 0; i < 2; i++) for (const stmt of BOOTSTRAP_STATEMENTS) db.exec(stmt);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='webhook_inbox'").get()).toBeTruthy();
    db.close();
  });
});
