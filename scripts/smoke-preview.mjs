// Exercises the built Worker and real browser UI with isolated local storage and fake credentials.
// Usage: node scripts/smoke-preview.mjs <absolute temporary directory>
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdtemp } from "node:fs/promises";

const dir = process.argv[2];
if (!dir?.startsWith("/")) throw new Error("Provide an absolute scratch directory");
const state = await mkdtemp(resolve(dir, "cms-tools-smoke-"));
const base = "http://127.0.0.1:8799";
const config = "tests/wrangler.json";
let output = "";
const current = { id: "smoke-item", isDraft: true, isArchived: false, lastPublished: null, lastUpdated: new Date().toISOString(), fieldData: { name: "Smoke test article", slug: "smoke-test", body: "Original" } };
const mock = createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.url === "/v2/sites/smoke-site") res.end(JSON.stringify({ shortName: "smoke-site", customDomains: [{ id: "production", url: "www.example.com" }] }));
  else if (req.url.includes("/items/")) res.end(JSON.stringify(current));
  else res.end(JSON.stringify({ id: "smoke-collection", displayName: "Smoke collection", slug: "smoke", fields: [] }));
});
await new Promise(resolve => mock.listen(8798, "127.0.0.1", resolve));
const server = spawn("npx", ["wrangler", "dev", "--config", config, "--port", "8799", "--local", "--persist-to", state], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
server.stdout.on("data", d => { output += d; });
server.stderr.on("data", d => { output += d; });
let browser;
async function command(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("npx", args, { stdio: ["ignore", "pipe", "pipe"] });
    let text = ""; p.stdout.on("data", d => text += d); p.stderr.on("data", d => text += d);
    p.on("exit", code => code === 0 ? resolve(text) : reject(new Error(text)));
  });
}
try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${base}/login`)).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  assert(ready, output);
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${base}/login`);
  assert.equal(await page.getByText("Demo access").count(), 0);
  await page.getByLabel("Password", { exact: true }).fill("local-smoke-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(base + "/");
  await page.goto(`${base}/settings`);
  await page.getByRole("heading", { name: "History & health", exact: true }).waitFor();
  await page.getByLabel("Group ordinary saves within").fill("10");
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.getByText("Settings saved.", { exact: false }).waitFor();
  const sql = `INSERT OR IGNORE INTO collections(id,site_id,display_name,slug) VALUES('smoke-collection','smoke-site','Smoke collection','smoke'); INSERT OR IGNORE INTO webhooks(id,trigger_type,url,secret,created_at) VALUES('smoke-hook','collection_item_changed','http://localhost','smoke-secret',0);`;
  await command(["wrangler", "d1", "execute", "DB", "--local", "--config", config, "--persist-to", state, "--command", sql]);
  for (let i = 0; i < 3; i++) {
    current.lastUpdated = new Date(Date.now() + i).toISOString();
    current.fieldData.body = `Edit ${i}`;
    const raw = JSON.stringify({ triggerType: "collection_item_changed", payload: { ...current, siteId: "smoke-site", collectionId: "smoke-collection" } });
    const ts = String(Date.now());
    const sig = createHmac("sha256", "smoke-secret").update(`${ts}:${raw}`).digest("hex");
    const response = await fetch(`${base}/api/webhooks/webflow`, { method: "POST", body: raw, headers: { "x-webflow-timestamp": ts, "x-webflow-signature": sig } });
    assert.equal(response.status, 200, await response.text());
  }
  await page.goto(`${base}/collections/smoke-collection/items/smoke-item`);
  await page.getByText("Editing session · 2 saves", { exact: false }).waitFor();
  const checkpoint = page.getByRole("button", { name: "Save checkpoint", exact: true });
  assert.equal(await checkpoint.getAttribute("aria-expanded"), "false");
  assert.equal(await page.getByRole("link", { name: "View live", exact: false }).getAttribute("href"), "https://www.example.com/smoke/smoke-test");
  assert.equal(await page.getByRole("link", { name: "View staging", exact: false }).getAttribute("href"), "https://smoke-site.webflow.io/smoke/smoke-test");
  assert.equal(await page.getByRole("link", { name: "View staging", exact: false }).getAttribute("target"), "_blank");
  await checkpoint.click();
  assert.equal(await checkpoint.getAttribute("aria-expanded"), "true");
  await page.getByLabel("Checkpoint name").fill("Launch checkpoint");
  await page.getByRole("button", { name: "Capture current state" }).click();
  await page.getByRole("button", { name: "Launch checkpoint", exact: true }).waitFor();
  await page.screenshot({ path: resolve(dir, "cms-tools-history-desktop.png"), fullPage: true });
  await page.getByLabel("Show every captured edit").check();
  assert.equal(await page.getByText("Editing session ·", { exact: false }).count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(dir, "cms-tools-history-mobile.png"), fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Item header overflows on mobile");
  await page.goto(`${base}/settings`);
  await page.getByRole("heading", { name: "History & health", exact: true }).waitFor();
  await page.screenshot({ path: resolve(dir, "cms-tools-settings-mobile.png"), fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Mobile layout overflows horizontally");
  assert.deepEqual(errors, []);
  console.log("Worker/browser smoke passed: login, migration, settings save, signed webhook capture, grouped history, checkpoint button, live/staging links, manual checkpoint, all-edits toggle, mobile render.");
} catch (err) {
  console.error(output.slice(-12000));
  throw err;
} finally {
  await browser?.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
  mock.close();
}
