#!/usr/bin/env node
// Local E2E helper: a minimal mock of the Webflow Data API v2, so sync,
// backfill fallbacks, and webhook collection-discovery can be exercised
// without real credentials. Point the app at it via WEBFLOW_API_BASE in
// .dev.vars (see .dev.vars.example), then run it alongside `npm run dev`:
//
//   node scripts/mock-webflow-api.mjs
//
// Pairs with scripts/seed-local.sql + scripts/simulate-webhooks.mjs.

import { createServer } from "node:http";

const PORT = 8787;

const FIELDS = [
  { id: "f1", slug: "name", displayName: "Name", type: "PlainText" },
  { id: "f2", slug: "slug", displayName: "Slug", type: "PlainText" },
  { id: "f3", slug: "role", displayName: "Role", type: "PlainText" },
  { id: "f4", slug: "bio", displayName: "Bio", type: "RichText" },
];

const COLLECTIONS = {
  col_local_blog: {
    id: "col_local_blog",
    displayName: "Blog Posts",
    slug: "blog-posts",
    fields: FIELDS,
  },
  col_local_team: {
    id: "col_local_team",
    displayName: "Team Members",
    slug: "team-members",
    fields: FIELDS,
  },
};

// Unknown collection ids still resolve — lets you test webhook discovery
// with any made-up id without editing this file.
function collectionFor(id) {
  return (
    COLLECTIONS[id] ?? {
      id,
      displayName: `Collection ${id}`,
      slug: id.toLowerCase().replaceAll("_", "-"),
      fields: FIELDS,
    }
  );
}

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  console.log(req.method, url.pathname);

  let body = null;
  const collection = url.pathname.match(/^\/v2\/collections\/([^/]+)$/);
  if (url.pathname.match(/^\/v2\/sites\/[^/]+\/collections$/)) {
    body = { collections: Object.values(COLLECTIONS) };
  } else if (collection) {
    body = collectionFor(collection[1]);
  }

  if (body) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  } else {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: `no mock for ${url.pathname}` }));
  }
}).listen(PORT, () => console.log(`mock webflow api on :${PORT}`));
