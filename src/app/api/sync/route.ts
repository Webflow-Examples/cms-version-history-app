import { NextResponse } from "next/server";
import { syncCollections } from "@/lib/sync";

// On-demand collection re-sync. New collections are picked up automatically
// by webhook ingest; this catches renames, field/schema changes, and any
// collection that has never fired an event.
export async function POST() {
  try {
    const { count } = await syncCollections();
    return NextResponse.json({ ok: true, collections: count });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
