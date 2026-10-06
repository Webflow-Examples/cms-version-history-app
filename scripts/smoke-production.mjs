// Read-only post-deploy checks after sign-in. Does not edit CMS items or settings.
// Credentials are read locally and never printed. Prefer APP_PASSWORD in the environment.
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import assert from "node:assert/strict";

const argument = process.argv[2];
if (!argument) throw new Error("Usage: node scripts/smoke-production.mjs https://YOUR_HOST/app");
const destination = new URL(argument);
if (!["https:", "http:"].includes(destination.protocol) || destination.username || destination.password || /[?#]/.test(destination.href)) {
  throw new Error("Provide an HTTP(S) app base URL without credentials, query, or fragment");
}
const base = destination.href.replace(/\/+$/, "");
let password = process.env.APP_PASSWORD;
if (!password) {
  const local = await readFile(new URL("../.dev.vars", import.meta.url), "utf8");
  password = local.match(/^APP_PASSWORD\s*=\s*(.*?)\s*$/m)?.[1]?.replace(/^(["'])(.*)\1$/, "$2");
}
if (!password) throw new Error("APP_PASSWORD is required for authenticated verification");
const unauthorized = await fetch(`${base}/api/inbox/replay`, { method: "POST", redirect: "manual" });
assert.equal(unauthorized.status, 401, "Unauthenticated replay must be rejected");
const jobs = await fetch(`${base}/api/jobs/run`, { method: "POST", redirect: "manual" });
assert.equal(jobs.status, 401, "Scheduler endpoint must require its own secret");
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${base}/login`);
  assert.equal(await page.getByText("Demo access").count(), 0);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const loginResult = page.waitForResponse(r => r.url().endsWith("/api/login") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const loginResponse = await loginResult;
  assert.equal(loginResponse.status(), 200, `Production sign-in rejected the supplied password (HTTP ${loginResponse.status()})`);
  await page.waitForURL(url => !url.pathname.endsWith("/login"), { timeout: 20000 });
  await page.goto(`${base}/settings`);
  await page.getByRole("heading", { name: "History & health", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Webhook inbox", exact: true }).waitFor();
  console.log("Production settings rendered: migration and inbox queries succeeded.");
  const scheduler = await page.getByText("Last scheduler tick:", { exact: false }).textContent();
  console.log(scheduler);
  const collectionLink = await page.locator('a[href*="/collections/"]').first().getAttribute("href");
  if (collectionLink) {
    await page.goto(new URL(collectionLink, base).href);
    await page.getByRole("navigation", { name: "Collection pagination" }).waitFor();
    const itemLink = await page.locator('a[href*="/items/"]').first().getAttribute("href");
    if (itemLink) {
      await page.goto(new URL(itemLink, base).href);
      await page.getByLabel("Show every captured edit").waitFor();
      await page.getByLabel("Show every captured edit").check();
      const previewLinks = page.getByRole("region", { name: "Item preview links" });
      await previewLinks.waitFor();
      const stagingLink = previewLinks.getByRole("link", { name: "View staging", exact: false });
      if (await stagingLink.count()) {
        const href = await stagingLink.getAttribute("href");
        assert(href?.startsWith("https://") || href?.startsWith("http://"));
        assert.equal(await stagingLink.getAttribute("target"), "_blank");
        console.log(`Staging item links available on ${new URL(href).hostname}.`);
      }
      console.log("Existing production item history rendered; all-edits toggle works.");
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/settings`);
  await page.getByRole("heading", { name: "History & health", exact: true }).waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.deepEqual(errors, []);
  console.log("Production smoke passed: authentication, protected endpoints, migrated settings, existing data, mobile layout; no client exceptions.");
} finally { await browser.close(); }
