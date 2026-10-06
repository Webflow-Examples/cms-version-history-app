#!/usr/bin/env node
// Local E2E helper: sends signed, simulated Webflow CMS webhook events at the
// ingest endpoint. Pairs with scripts/seed-local.sql (which registers the
// webhook secret this script signs with).
//
// Usage: node scripts/simulate-webhooks.mjs [baseUrl]

import { createHmac } from "node:crypto";

const BASE_URL = process.argv[2] ?? "http://localhost:3000";
const SECRET = "local-test-webhook-secret";
const COLLECTION_ID = "col_local_blog";
const ITEM_ID = "item_local_001";

async function send(triggerType, payload) {
  const body = JSON.stringify({ triggerType, payload });
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", SECRET)
    .update(`${timestamp}:${body}`)
    .digest("hex");
  const res = await fetch(`${BASE_URL}/api/webhooks/webflow`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webflow-timestamp": timestamp,
      "x-webflow-signature": signature,
    },
    body,
  });
  const text = await res.text();
  console.log(`${triggerType} → ${res.status} ${text}`);
  return res.status;
}

function itemPayload(overrides = {}) {
  return {
    id: ITEM_ID,
    siteId: "local-dev-site",
    collectionId: COLLECTION_ID,
    workspaceId: "ws_local",
    lastPublished: null,
    lastUpdated: new Date().toISOString(),
    createdOn: "2026-07-01T12:00:00.000Z",
    isArchived: false,
    isDraft: true,
    fieldData: {
      name: "Exciting blog post",
      slug: "exciting-blog-post",
      "post-summary": "A summary of the exciting blog post.",
      "post-body":
        "<h2>Welcome</h2><p>This is the <strong>original</strong> body copy with a typo: recieve.</p>",
      featured: false,
    },
    ...overrides,
  };
}

const failures = [];
const check = (name, status, expected = 200) => {
  if (status !== expected) failures.push(`${name}: got ${status}, want ${expected}`);
};

// 1. Item created
check("created", await send("collection_item_created", itemPayload()));

// 2. Item changed — edited body, fixed typo, new summary, flipped switch
check(
  "changed",
  await send(
    "collection_item_changed",
    itemPayload({
      fieldData: {
        name: "Exciting blog post (updated)",
        slug: "exciting-blog-post",
        "post-summary": "A fresh summary after the edit.",
        "post-body":
          "<h2>Welcome</h2><p>This is the <em>revised</em> body copy, now correct: receive. And a whole new sentence.</p>",
        featured: true,
      },
    }),
  ),
);

// 3. Duplicate delivery (same content) — should dedupe to no new snapshot
check(
  "changed-duplicate",
  await send(
    "collection_item_changed",
    itemPayload({
      fieldData: {
        name: "Exciting blog post (updated)",
        slug: "exciting-blog-post",
        "post-summary": "A fresh summary after the edit.",
        "post-body":
          "<h2>Welcome</h2><p>This is the <em>revised</em> body copy, now correct: receive. And a whole new sentence.</p>",
        featured: true,
      },
    }),
  ),
);

// 4. Item published
check(
  "published",
  await send(
    "collection_item_published",
    itemPayload({
      isDraft: false,
      lastPublished: new Date().toISOString(),
      fieldData: {
        name: "Exciting blog post (updated)",
        slug: "exciting-blog-post",
        "post-summary": "A fresh summary after the edit.",
        "post-body":
          "<h2>Welcome</h2><p>This is the <em>revised</em> body copy, now correct: receive. And a whole new sentence.</p>",
        featured: true,
      },
    }),
  ),
);

// 5. Bad signature must be rejected
{
  const body = JSON.stringify({
    triggerType: "collection_item_changed",
    payload: itemPayload(),
  });
  const res = await fetch(`${BASE_URL}/api/webhooks/webflow`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webflow-timestamp": String(Date.now()),
      "x-webflow-signature": "deadbeef".repeat(8),
    },
    body,
  });
  console.log(`bad-signature → ${res.status} (expect 401)`);
  check("bad-signature", res.status, 401);
}

// 6. Second item, then delete it — tests deleted-item recovery view
check(
  "created-2",
  await send(
    "collection_item_created",
    itemPayload({
      id: "item_local_002",
      fieldData: {
        name: "Doomed post",
        slug: "doomed-post",
        "post-summary": "This one gets deleted.",
        "post-body": "<p>Goodbye world.</p>",
        featured: false,
      },
    }),
  ),
);
check(
  "deleted-2",
  await send("collection_item_deleted", {
    id: "item_local_002",
    siteId: "local-dev-site",
    collectionId: COLLECTION_ID,
    workspaceId: "ws_local",
  }),
);

if (failures.length) {
  console.error(`\nFAILURES:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nAll simulated webhook checks passed.");
