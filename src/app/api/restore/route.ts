import { NextRequest, NextResponse } from "next/server";
import { restoreSnapshot } from "@/lib/restore";
import { WebflowError } from "@/lib/webflow";

export async function POST(request: NextRequest) {
  const { snapshotId, mode, expectedHash, requestId } = (await request.json().catch(() => ({}))) as {
    snapshotId?: number;
    mode?: "draft" | "live";
    expectedHash?: string;
    requestId?: string;
  };
  if (!Number.isSafeInteger(snapshotId) || !snapshotId || snapshotId < 1 || !mode || !["draft", "live"].includes(mode) || typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedHash) || typeof requestId !== "string" || !/^[a-f0-9-]{36}$/.test(requestId)) {
    return NextResponse.json(
        { error: "snapshotId, mode, request id and current content hash required" },
      { status: 400 },
    );
  }
  try {
    const result = await restoreSnapshot(snapshotId, mode, expectedHash, requestId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof WebflowError) {
      // Surface Webflow validation errors (e.g. slug conflicts, removed fields)
      return NextResponse.json(
        { ok: false, error: err.message, detail: err.body },
        { status: 422 },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
