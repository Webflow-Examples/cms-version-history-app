// WebCrypto helpers (Workers runtime — no Node crypto).

const encoder = new TextEncoder();

export async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return toHex(digest);
}

export async function hmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toHex(sig);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Webflow webhook signature: HMAC-SHA256(secret, `${timestamp}:${body}`),
// compared against x-webflow-signature; timestamp must be within 5 minutes.
export async function verifyWebflowSignature(opts: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  nowMs?: number;
}): Promise<boolean> {
  const { secret, timestamp, signature, rawBody } = opts;
  if (!timestamp || !signature) return false;
  const age = (opts.nowMs ?? Date.now()) - Number(timestamp);
  if (!Number.isFinite(age) || Math.abs(age) > 5 * 60 * 1000) return false;
  const expected = await hmacSha256Hex(secret, `${timestamp}:${rawBody}`);
  return timingSafeEqual(expected, signature);
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
