import { NextResponse } from "next/server";
import { replayInbox } from "@/lib/ingest";
export async function POST() {
  return NextResponse.json(await replayInbox());
}
