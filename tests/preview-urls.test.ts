import { describe, expect, it } from "vitest";
import { itemPageUrl, normalizeWebsiteBase, resolveItemPreviews } from "../src/lib/preview-urls";

const site = {
  shortName: "demo-site",
  customDomains: [{ id: "production", url: "www.example.com" }],
};
const item = { collectionSlug: "blog", itemSlug: "thai-cuisine" };

describe("item preview URL construction", () => {
  it("discovers live and staging domains without using the app mount", () => {
    const previews = resolveItemPreviews({ site, ...item });
    expect(previews.live[0].url).toBe("https://www.example.com/blog/thai-cuisine");
    expect(previews.staging?.url).toBe("https://demo-site.webflow.io/blog/thai-cuisine");
    expect(previews.notices).toEqual([]);
  });
  it("preserves website prefixes, nested collection paths, and encoded slugs", () => {
    expect(itemPageUrl("https://example.com/en/", "/resources/blog/", "caf%C3%A9"))
      .toBe("https://example.com/en/resources/blog/caf%C3%A9");
    expect(itemPageUrl("https://example.com", "blog", "café"))
      .toBe("https://example.com/blog/caf%C3%A9");
    expect(itemPageUrl("https://example.com", "blog", "question?yes#fragment"))
      .toBe("https://example.com/blog/question%3Fyes%23fragment");
  });
  it("lets explicit environment bases override discovery even if the API is unavailable", () => {
    const previews = resolveItemPreviews({ site: null, ...item,
      productionSiteUrl: "https://production.example/en/", stagingSiteUrl: "https://staging.example/" });
    expect(previews.live[0].url).toBe("https://production.example/en/blog/thai-cuisine");
    expect(previews.staging?.url).toBe("https://staging.example/blog/thai-cuisine");
    expect(previews.notices).toEqual([]);
  });
  it("does not guess a default when multiple custom domains are connected", () => {
    const multi = { ...site, customDomains: [{ id: "a", url: "other.example.com" }, ...site.customDomains, { id: "duplicate", url: "https://www.example.com/" }] };
    const previews = resolveItemPreviews({ site: multi, ...item });
    expect(previews.live).toHaveLength(2);
    expect(resolveItemPreviews({ site: multi, ...item, productionSiteUrl: "https://www.example.com" }).live).toHaveLength(1);
  });
  it("keeps staging usable when no production domain is connected", () => {
    const previews = resolveItemPreviews({ site: { shortName: "demo-site" }, ...item });
    expect(previews.live).toEqual([]);
    expect(previews.staging?.url).toContain("demo-site.webflow.io/blog/thai-cuisine");
    expect(previews.notices.join(" ")).toContain("PRODUCTION_SITE_URL");
  });
  it("does not use the site's previewUrl image as a page link", () => {
    const previews = resolveItemPreviews({ site: { customDomains: [] }, ...item });
    expect(previews.staging).toBeNull();
  });
  it("rejects unsafe or ambiguous base URLs and path traversal", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,test", "//evil.example", "https://user:secret@example.com", "https://example.com?", "https://example.com/#", "https://example.com?q=1"])
      expect(normalizeWebsiteBase(url)).toBeNull();
    for (const slug of ["..", ".", "%2e%2e", "../evil", "a%2fb", "a\\b", "", "%invalid"])
      expect(itemPageUrl("https://example.com", "blog", slug)).toBeNull();
    expect(itemPageUrl("https://example.com", "../blog", "item")).toBeNull();
    const invalidOverride = resolveItemPreviews({ site, ...item, productionSiteUrl: "javascript:alert(1)" });
    expect(invalidOverride.live).toEqual([]);
    expect(invalidOverride.notices.join(" ")).toContain("PRODUCTION_SITE_URL");
  });
  it("handles missing slugs without generating a guessed URL", () => {
    expect(resolveItemPreviews({ site, collectionSlug: null, itemSlug: "item" }).live).toEqual([]);
    expect(resolveItemPreviews({ site, collectionSlug: "blog", itemSlug: null }).staging).toBeNull();
  });
  it("includes redirected primary locale paths only on discovered bases", () => {
    const localized = { ...site, locales: { primary: { cmsLocaleId: "en", subdirectory: "en", redirect: true } } };
    const previews = resolveItemPreviews({ site: localized, ...item, productionSiteUrl: "https://www.example.com/en" });
    expect(previews.live[0].url).toBe("https://www.example.com/en/blog/thai-cuisine");
    expect(previews.staging?.url).toBe("https://demo-site.webflow.io/en/blog/thai-cuisine");
  });
});
