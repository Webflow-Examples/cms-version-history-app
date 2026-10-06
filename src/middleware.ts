import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  verifySessionToken,
  getSessionSecret,
} from "@/lib/session";

// Everything is gated behind the password session except:
// - /login + /api/login (how you get a session)
// - /api/webhooks/* (authenticated by Webflow HMAC signature instead)
const PUBLIC_PATHS = [/^\/login$/, /^\/api\/login$/, /^\/api\/webhooks\//, /^\/api\/jobs\/run$/];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((re) => re.test(pathname))) {
    return NextResponse.next();
  }

  const secret = await getSessionSecret();
  if (!secret) {
    return new NextResponse(
      "SESSION_SECRET is not configured — see .dev.vars.example",
      { status: 500 },
    );
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(secret, token)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  // Skip Next.js internals and static assets. "/" is listed explicitly:
  // a request for exactly the base path can otherwise slip past the pattern.
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
