import { NextRequest, NextResponse } from "next/server";
import { continueBackfill } from "@/lib/sync";

// The UI polls this until status leaves "running" — chunked work that
// composes with the 20s request timeout on any collection size.
export async function POST(request: NextRequest) {
  const { jobId } = (await request.json().catch(() => ({}))) as { jobId?: number };
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }
  const progress = await continueBackfill(jobId);
  return NextResponse.json(progress);
}
