import { getBindings } from "@/db";
import { getConfig } from "./env";
import { WebflowClient, type WebflowSite } from "./webflow";
import { resolveItemPreviews } from "./preview-urls";

/** Cache only discovery, not environment overrides or item slugs. */
export async function getItemPreviews(collectionSlug: string | null, itemSlug: string | null) {
  const config = await getConfig();
  let site: WebflowSite | null = null;
  if (!config.productionSiteUrl?.trim() || !config.stagingSiteUrl?.trim()) {
    const { CACHE } = await getBindings();
    const key = `item-preview-site:v1:${config.siteId}`;
    let cached: string | null = null;
    try { cached = await CACHE.get(key); } catch { /* Discovery also works without cache. */ }
    if (cached) {
      try { site = JSON.parse(cached) as WebflowSite | null; }
      catch { cached = null; }
    }
    if (!cached) {
      try { site = await new WebflowClient(config.siteToken, config.apiBase).getSite(config.siteId); }
      catch { /* Preview links must not take down the item's version history. */ }
      await CACHE.put(key, JSON.stringify(site), { expirationTtl: site ? 300 : 60 }).catch(() => {});
    }
  }
  return resolveItemPreviews({ site, collectionSlug, itemSlug,
    productionSiteUrl: config.productionSiteUrl, stagingSiteUrl: config.stagingSiteUrl });
}
