// Client-safe helper: Next's <Link>/router handle basePath automatically but
// plain fetch() does not. The root layout stamps the configured base path on
// <body> when the build can read it from the environment — but deployed
// Webflow Cloud builds bake the base path into the bundle without exposing an
// env var, so fall back to inferring it from Next's own asset URLs, whose
// pathname always carries the base path (e.g. "/app/_next/static/...").
export function apiPath(path: string): string {
  if (typeof document !== "undefined") {
    const stamped = document.body.dataset.basePath;
    if (stamped) return `${stamped}${path}`;
    const asset = document.querySelector<HTMLScriptElement | HTMLLinkElement>(
      'script[src*="/_next/"], link[href*="/_next/"]',
    );
    const assetUrl = asset && ("src" in asset ? asset.src : asset.href);
    if (assetUrl) {
      const { pathname } = new URL(assetUrl, document.baseURI);
      const basePath = pathname.slice(0, pathname.indexOf("/_next/"));
      return `${basePath}${path}`;
    }
  }
  return path;
}
