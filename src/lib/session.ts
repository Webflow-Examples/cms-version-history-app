import { getCloudflareContext } from "@opennextjs/cloudflare";
import { hmacSha256Hex, timingSafeEqual } from "./crypto";

export const SESSION_COOKIE = "cms_tools_session";

// Deployed, the worker populates process.env. In `next dev`, the edge sandbox
// (middleware) strips .dev.vars values from process.env, so fall back to the
// Cloudflare context (async mode is safe in middleware and layouts).
export async function getSessionSecret(): Promise<string | undefined> {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as unknown as Record<string, string | undefined>)
      .SESSION_SECRET;
  } catch {
    return undefined;
  }
}
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

// Stateless signed session: "<expiryMs>.<hmac(secret, expiryMs)>"
export async function createSessionToken(secret: string): Promise<string> {
  const expiry = String(Date.now() + SESSION_TTL_MS);
  const sig = await hmacSha256Hex(secret, expiry);
  return `${expiry}.${sig}`;
}

export async function verifySessionToken(
  secret: string,
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  const [expiry, sig] = token.split(".");
  if (!expiry || !sig) return false;
  if (!Number.isFinite(Number(expiry)) || Number(expiry) < Date.now()) return false;
  const expected = await hmacSha256Hex(secret, expiry);
  return timingSafeEqual(expected, sig);
}
