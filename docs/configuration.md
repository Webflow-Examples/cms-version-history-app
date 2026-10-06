# Configuration reference

[Documentation index](README.md) · [Installation](installation.md)

## Environment variables

Runtime values are read from Cloud bindings first, then `process.env`. Local
development uses `.dev.vars`; it is ignored by Git. Copy
[`.dev.vars.example`](../.dev.vars.example) without overwriting an existing local
configuration. Never use `NEXT_PUBLIC_` for tokens, passwords, or signing secrets.

| Variable | Required | Purpose / default |
|---|---|---|
| `WEBFLOW_SITE_TOKEN` | Yes | Site API token for the CMS source site. Required even for app sign-in because configuration is validated together. |
| `WEBFLOW_SITE_ID` | Yes | The CMS source site this installation manages. One site per installation. |
| `APP_PASSWORD` | Yes | Shared password for the app UI and session-authenticated endpoints. |
| `SESSION_SECRET` | Yes | Signs the app's 12-hour session cookie. Use a separate random value. |
| `APP_URL` | No | Canonical public **app base URL**, including mount. Setup otherwise derives it from the incoming request. |
| `PRODUCTION_SITE_URL` | No | Public **website base** for View live. Otherwise uses connected custom domains. |
| `STAGING_SITE_URL` | No | Public **website base** for View staging. Otherwise uses the source site's `<shortName>.webflow.io`. |
| `JOBS_SECRET` | No | Dedicated bearer secret for `/api/jobs/run`. Without it, that route returns 401. It does not create a scheduler. |
| `WEBFLOW_API_BASE` | Local tests only | Overrides `https://api.webflow.com/v2`. Unset in production. The local mock uses `http://localhost:8787/v2`. |

Changing variables is environment-specific. Follow Cloud's apply/deploy flow, then
verify the resulting behavior; this app does not provide a secret-management UI.

### Three different URL concepts

Example for an app hosted under `/app`:

```dotenv
APP_URL=https://tools-host.webflow.io/app
PRODUCTION_SITE_URL=https://www.example.com
STAGING_SITE_URL=https://example.webflow.io
```

For collection slug `blog` and item slug `thai-cuisine`:

```text
Webhook: https://tools-host.webflow.io/app/api/webhooks/webflow
Live:    https://www.example.com/blog/thai-cuisine
Staging: https://example.webflow.io/blog/thai-cuisine
```

Do not append `/api/webhooks/webflow` to `APP_URL`; setup appends it. Do not append
`/app` to the website bases unless the CMS website itself really lives under that path.

Website overrides must be absolute HTTP(S) URLs without credentials, query strings,
or fragments. They may include a shared path prefix, such as `https://example.com/en`.
Production app hosting and webhook callbacks should use HTTPS.

### Automatic preview discovery

- Uses the source site ID, not the host app's domain or the site's screenshot `previewUrl`.
- A single connected custom domain produces one View live link. Multiple domains
  produce a chooser; the API does not identify a default domain. Set
  `PRODUCTION_SITE_URL` to pin a destination.
- No custom domain means View live is unavailable unless overridden. Staging can
  still work independently.
- Site metadata is cached in KV for five minutes; failed discovery is cached for
  one minute. Explicit bases are read from configuration, not that cache.
- A redirected primary-locale subdirectory is included on discovered bases.
  Explicit bases must include any required prefix themselves.
- Paths use the stored collection slug and latest known item slug. Nested segments
  are preserved if present in the collection slug. Custom routing, folders not
  represented by that slug, or per-collection rewrites require adaptation; there is
  no per-collection URL-template setting.

These are published-page links. The app does not generate signed draft-preview
URLs, publish environments when a link is clicked, or check each destination for a 404.

## Storage bindings

Declared in [`wrangler.json`](../wrangler.json):

| Binding | Provider resource | Stored data |
|---|---|---|
| `DB` | D1 / SQLite | Items, collections, snapshot metadata, events, webhook secrets, inbox, policies, leases, restore journal, jobs |
| `SNAPSHOTS` | R2 / object storage | Gzipped JSON item snapshots |
| `CACHE` | KV | Primary-locale lookup, preview-site metadata, last scheduler tick |
| `ASSETS` | Build asset binding | Compiled/static app assets; not CMS backups |

Cloud manages resources per environment. Keep names consistent with `src/db/index.ts`
and generated binding types. Changing/removing a resource binding can make existing
history inaccessible. `DB` contains webhook signing secrets; treat exports as sensitive.

The schema and R2 blobs belong together. Copying only one does not produce a usable
history restore. CMS media referenced by a snapshot is not copied into this R2 bucket.

## Build-time mount configuration

The Cloud build configures the app's mount. Locally, [`next.config.ts`](../next.config.ts)
reads `BASE_URL` as a **path**, for example `/app`, and `ASSETS_PREFIX` as the asset
prefix. These are build-time controls, not substitutes for `APP_URL`.

Normally leave both unset for root-mounted local development. If testing a mount,
set `BASE_URL` in the build/dev command environment. Next.js links/router handle
the mount automatically; client `fetch()` calls must use `apiPath()` from
`src/lib/basePath.ts`. Avoid hard-coded `/app` prefixes in app source.

## Access model

The app sets an HttpOnly, Secure, SameSite=Lax session cookie for 12 hours. Everyone
with the shared password has the same capabilities, including restore and publish.
There is no role separation or login rate limiter in the current code.

Rotating `APP_PASSWORD` changes future sign-in credentials. Existing sessions remain
valid until expiry; rotate `SESSION_SECRET` too when all sessions must be invalidated.
Do not reuse `SESSION_SECRET` as `JOBS_SECRET` or as a webhook signing secret.
