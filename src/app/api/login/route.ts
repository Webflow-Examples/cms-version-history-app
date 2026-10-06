import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/env";
import { timingSafeEqual } from "@/lib/crypto";
import { SESSION_COOKIE, createSessionToken } from "@/lib/session";

export async function POST(request: NextRequest) {
  const { password } = (await request.json().catch(() => ({}))) as {
    password?: string;
  };
  const config = await getConfig();
  if (!password || !timingSafeEqual(password, config.appPassword)) {
    return NextResponse.json({ error: "invalid password" }, { status: 401 });
  }
  const token = await createSessionToken(config.sessionSecret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return res;
}
