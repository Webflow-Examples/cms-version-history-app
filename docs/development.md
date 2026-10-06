# Development and testing

[Documentation index](README.md) · [Agent instructions](../AGENTS.md)

## Toolchain and installation

Use **Node.js 24**, the locally tested version, and npm. Tests use `node:sqlite`
and current Vitest tooling; older Node versions are not a supported test baseline.
Install from the committed lockfile:

```bash
node --version
npm ci
```

Do not replace `package-lock.json` with another package manager's lockfile. The
PostCSS and sharp overrides in `package.json` are intentional security updates;
dependency changes need a Workers
build as well as TypeScript checks.

Builds need network access to install packages and fetch the `next/font/google`
fonts configured in `src/app/layout.tsx` unless those resources are already cached.

## Start the app locally

If `.dev.vars` does not already exist:

```bash
cp .dev.vars.example .dev.vars
```

For isolated manual testing, use these **fake local values**, not a production token:

```dotenv
WEBFLOW_SITE_TOKEN=local-test-only
WEBFLOW_SITE_ID=local-dev-site
APP_PASSWORD=local-only-password
SESSION_SECRET=local-only-signing-secret
WEBFLOW_API_BASE=http://localhost:8787/v2
```

In separate terminals:

```bash
node scripts/mock-webflow-api.mjs
```

```bash
npm run dev
```

Open `http://localhost:3000/login`, sign in with your configured local password,
then open the overview to initialize local D1. Browser localhost handling normally
permits the Secure session cookie; if your browser does not, use local HTTPS.

The mock server is intentionally limited. It covers collection metadata, not the
complete Webflow API. **Do not use Run setup or a restore as a full mock integration
test**; use the automated tests/browser smoke below. The fixture path for simulated
webhooks is:

```bash
npx wrangler d1 execute CMS_TOOLS_DB --local --file scripts/seed-local.sql
node scripts/simulate-webhooks.mjs http://localhost:3000
```

The configured source ID must be `local-dev-site` for these deliveries. The seed
replaces fake collection/webhook rows in the **local** database. Never omit `--local`
or point these fixtures at production. The simulator verifies response statuses;
the automated tests below make the stronger storage/side-effect assertions.

Using a real site token instead connects app actions to real CMS content, even when
the app itself runs on localhost. Use a separate test site and authorize write tests.

## Automated behavior checks

```bash
npm test
npm run typecheck
npm run lint
```

- `tests/history.test.ts`: policy semantics, grouping, and schema migration checks.
- `tests/reliability.test.ts`: real local D1/R2/KV via Miniflare, mocked outbound
  Webflow calls, delivery/replay/ordering, restore safety, and domain-cache behavior.
- `tests/preview-urls.test.ts`: preview URL paths, encoding, validation, overrides,
  domain choices, and locale prefixes.

These tests do not need a real Webflow site or token and do not use production
storage. `next lint` currently reports a deprecation notice; it still works for the
locked Next.js 15 version. A future Next major upgrade needs a lint-command review.

## Workers production build

```bash
npx opennextjs-cloudflare build
```

This builds Next.js and the Workers bundle in `.open-next/`. It does not deploy or
publish a website. `npm run build` alone validates the Next.js build, not the final
Workers packaging. `npm run preview` builds and serves the bundle locally using
your normal local configuration; do not confuse local storage isolation with
isolation from a real token's external API writes.

If type checking on a pristine checkout needs generated Next artifacts, run the
build and retry type checking. The checked-in Cloudflare types provide binding
types; regenerate them with `npm run cf-typegen` only when needed and inspect the
diff for environment-specific details before committing.

## Isolated browser smoke test

The script uses the built Worker, fake credentials, a mock API, and newly isolated
storage under the scratch directory. It checks sign-in, settings, capture, history,
checkpoint controls, preview link destinations, and mobile layout. It writes screenshots
to the scratch directory and does not navigate to the external preview destinations.

Requirements: macOS/Linux, available ports **8798 and 8799**, and Chrome/Chromium.
The script starts/stops its own processes using POSIX process groups. Windows users
need WSL or an adaptation of that process lifecycle.

macOS with Google Chrome installed at its standard path:

```bash
npx opennextjs-cloudflare build
SCRATCH_DIR="$(mktemp -d)"
node scripts/smoke-preview.mjs "$SCRATCH_DIR"
```

For another Chrome install, supply `CHROME_PATH` as the full executable path. To
use Playwright-managed Chromium on a supported system:

```bash
npx playwright install chromium
CHROME_PATH="$(node --input-type=module -e 'import { chromium } from "playwright"; console.log(chromium.executablePath())')"
export CHROME_PATH
SCRATCH_DIR="$(mktemp -d)"
node scripts/smoke-preview.mjs "$SCRATCH_DIR"
```

The scratch directory must already exist and be absolute. Each run creates isolated
state beneath it. Review screenshots before deleting your own scratch artifacts.

## Post-deployment smoke test

Only run against the explicitly selected app URL. Supply `APP_PASSWORD` through a
secure environment variable. Otherwise the script reads it from local `.dev.vars`;
that password may differ from production.

```bash
node scripts/smoke-production.mjs https://YOUR_HOST.webflow.io/app
```

The script requires an explicit app URL and validates it before reading credentials
or making requests. It signs in and reads screens; it does not edit CMS items, change
settings, run setup, or initiate restores. Page reads can initialize/migrate D1 and
populate caches. It also checks unauthenticated replay and job requests are rejected.

The smoke test uses the same `CHROME_PATH` convention as the local browser test.
If credentials are rejected, report the blocked authenticated check rather than
guessing passwords or claiming it passed. It does not replace a deliberate real
webhook/restore acceptance test on a disposable CMS item.

## Release checks

For runtime changes, run the relevant behavior tests, typecheck/lint, the Workers
build, and browser checks when UI or mount handling changes. After an authorized
GitHub push, verify Cloud's deployment status **and commit SHA**.

For documentation-only changes, validate relative links, sample JSON, route/variable
names, commands, and `git diff --check`. Re-run runtime tests only if examples or
configuration changes affect execution. Do not deploy via CLI as a side effect of
documentation review.

The project-local documentation checker needs Python 3 and no third-party packages:

```bash
python3 scripts/check-docs.py --self-test
python3 scripts/check-docs.py .
git diff --check
```

It checks local Markdown links/heading anchors, fenced JSON, documented npm scripts,
runtime configuration names, API route coverage, and the portable manifest. It does
not fetch external URLs or prove that prose accurately describes behavior; code review
is still required. See the [script index](../scripts/INDEX.md) for helper-script roles.
