import { NextRequest, NextResponse } from "next/server";
import { setSnapshotLabel } from "@/lib/snapshots";

// Name (or rename/clear) a key version. Session-gated by middleware.
export async function POST(request: NextRequest) {
  const { snapshotId, label } = (await request.json().catch(() => ({}))) as {
    snapshotId?: number;
    label?: string;
  };
  if (!snapshotId || typeof label !== "string") {
    return NextResponse.json(
      { error: "snapshotId and label required" },
      { status: 400 },
    );
  }
  try {
    const saved = await setSnapshotLabel(snapshotId, label);
    return NextResponse.json({ ok: true, label: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
