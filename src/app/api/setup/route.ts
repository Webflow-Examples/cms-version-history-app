import { NextRequest, NextResponse } from "next/server";
import { syncCollections, registerWebhooks } from "@/lib/sync";

// The webhook callback must be an absolute URL, but it doesn't have to be
// configured: whichever domain this request arrived on (production, staging,
// a preview) is the domain webhooks should call back to. The request path is
// "<basePath>/api/setup", so stripping the suffix keeps the mount path intact.
// APP_URL, when set, still overrides this inside registerWebhooks.
function deriveBaseUrl(request: NextRequest): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto =
    request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const basePath = url.pathname.replace(/\/api\/setup\/?$/, "");
  return `${proto}://${host}${basePath}`;
}

// One-button setup: sync collection schemas, then register the five CMS item
// webhooks pointing back at this deployment.
export async function POST(request: NextRequest) {
  try {
    const sync = await syncCollections();
    const hooks = await registerWebhooks(deriveBaseUrl(request));
    return NextResponse.json({ ok: true, collections: sync.count, webhooks: hooks });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
