import type { WebflowSite } from "./webflow";

export interface PreviewTarget { url: string; hostname: string }
export interface ItemPreviews {
  live: PreviewTarget[];
  staging: PreviewTarget | null;
  notices: string[];
}

/** Website bases can have a path prefix, but never credentials, queries, or fragments. */
export function normalizeWebsiteBase(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || /[?#]/.test(url.href)) return null;
    return url.href.replace(/\/+$/, "");
  } catch { return null; }
}

function encodeSegment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    if (!decoded || [".", ".."].includes(decoded) || /[/\\\u0000-\u001f]/.test(decoded)) return null;
    return encodeURIComponent(decoded);
  } catch { return null; }
}

/** Relative CMS paths are appended to the website base, never the /app mount. */
export function itemPageUrl(base: string, collectionSlug: string, itemSlug: string): string | null {
  const website = normalizeWebsiteBase(base);
  const collection = collectionSlug.replace(/^\/+|\/+$/g, "").split("/").map(encodeSegment);
  const item = encodeSegment(itemSlug);
  if (!website || !item || collection.some(s => !s)) return null;
  return `${website}/${collection.join("/")}/${item}`;
}

export function resolveItemPreviews(options: {
  site: WebflowSite | null;
  collectionSlug: string | null;
  itemSlug: string | null;
  productionSiteUrl?: string;
  stagingSiteUrl?: string;
}): ItemPreviews {
  const { site, collectionSlug, itemSlug } = options;
  const result: ItemPreviews = { live: [], staging: null, notices: [] };
  if (!collectionSlug || !itemSlug) {
    result.notices.push("Item links need both a collection URL slug and an item slug.");
    return result;
  }
  const target = (base: string): PreviewTarget | null => {
    const url = itemPageUrl(base, collectionSlug, itemSlug);
    return url ? { url, hostname: new URL(url).host } : null;
  };
  // A primary-locale redirect can prefix the site's public URLs. Explicit bases
  // are used as given, allowing a different locale/proxy prefix when needed.
  const primary = site?.locales?.primary;
  const localeSegments = primary?.redirect && primary.subdirectory
    ? primary.subdirectory.replace(/^\/+|\/+$/g, "").split("/").map(encodeSegment) : [];
  const localePath = localeSegments.length && localeSegments.every(Boolean) ? `/${localeSegments.join("/")}` : "";
  const productionOverride = options.productionSiteUrl?.trim();
  if (productionOverride) {
    const live = target(productionOverride);
    if (live) result.live.push(live);
    else result.notices.push("PRODUCTION_SITE_URL must be an HTTP(S) website base without credentials, a query, or a fragment.");
  } else {
    for (const domain of site?.customDomains ?? []) {
      if (!domain.url) continue;
      const base = normalizeWebsiteBase(domain.url.includes("://") ? domain.url : `https://${domain.url}`);
      const live = base ? target(`${base}${localePath}`) : null;
      if (live && !result.live.some(t => t.url === live.url)) result.live.push(live);
    }
    result.live.sort((a, b) => a.hostname.localeCompare(b.hostname));
    if (!result.live.length) result.notices.push(site
      ? "No production domain connected. Set PRODUCTION_SITE_URL to enable View live."
      : "Production domain discovery is unavailable. Set PRODUCTION_SITE_URL or try again later.");
  }
  const stagingOverride = options.stagingSiteUrl?.trim();
  if (stagingOverride) {
    result.staging = target(stagingOverride);
    if (!result.staging) result.notices.push("STAGING_SITE_URL must be an HTTP(S) website base without credentials, a query, or a fragment.");
  } else if (site?.shortName && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(site.shortName)) {
    result.staging = target(`https://${site.shortName}.webflow.io${localePath}`);
  }
  if (!result.staging && !stagingOverride) result.notices.push("Staging domain is unavailable. Set STAGING_SITE_URL or try again later.");
  return result;
}
