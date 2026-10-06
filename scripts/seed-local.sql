-- Local E2E seed: a fake collection + a webhook registration whose secret
-- matches scripts/simulate-webhooks.mjs. Apply AFTER the app has bootstrapped
-- its schema (hit any page once), via:
--   npx wrangler d1 execute CMS_TOOLS_DB --local --file scripts/seed-local.sql
INSERT OR REPLACE INTO collections (id, site_id, display_name, slug, schema_json, item_count, last_synced_at)
VALUES (
  'col_local_blog',
  'local-dev-site',
  'Blog Posts',
  'blog-posts',
  '[{"id":"f1","slug":"name","displayName":"Name","type":"PlainText"},{"id":"f2","slug":"slug","displayName":"Slug","type":"PlainText"},{"id":"f3","slug":"post-summary","displayName":"Post Summary","type":"PlainText"},{"id":"f4","slug":"post-body","displayName":"Post Body","type":"RichText"},{"id":"f5","slug":"featured","displayName":"Featured","type":"Switch"}]',
  0,
  strftime('%s','now') * 1000
);

INSERT OR REPLACE INTO webhooks (id, trigger_type, url, secret, created_at)
VALUES (
  'wh_local_test',
  'collection_item_changed',
  'http://localhost:3000/api/webhooks/webflow',
  'local-test-webhook-secret',
  strftime('%s','now') * 1000
);
