import { NextRequest, NextResponse } from "next/server";
import { startBackfill, continueBackfill } from "@/lib/sync";

export async function POST(request: NextRequest) {
  const { collectionId } = (await request.json().catch(() => ({}))) as {
    collectionId?: string;
  };
  if (!collectionId) {
    return NextResponse.json({ error: "collectionId required" }, { status: 400 });
  }
  const jobId = await startBackfill(collectionId);
  // Do the first chunk of work inline so small collections finish in one call
  const progress = await continueBackfill(jobId);
  return NextResponse.json(progress);
}
