# Deploy the CMS Version History example

[Documentation index](README.md) · [Configuration reference](configuration.md)

This MIT-licensed template deploys a separate copy of the app. If you need to merge the functionality
into an existing Cloud app, use [Architecture and integration](architecture.md#integrate-into-an-existing-app).

## Prerequisites

- A Webflow site with CMS collections and permission to create a site API token.
- Access to create/manage a Webflow Cloud app and its environment variables.
- A GitHub repository that Webflow Cloud can read.
- Node.js 24 and npm for local review/testing.
- A private app password and a separate random session secret.

The current app does not require Designer page branching or the Webflow MCP at runtime.
It calls the Data API with a **site token**. OAuth installation and per-user sign-in
are not implemented.

Before selecting a hosting plan, check the current [Cloud limits](https://developers.webflow.com/webflow-cloud/limits)
and your site's CMS/API access. A successful small-site demo is not a capacity estimate.

## 1. Start from the example template

### One-click deployment

[![Deploy to Webflow](https://webflow.com/img/deploy-dark.svg)](https://webflow.com/dashboard/cloud/deploy?repo=https://github.com/Webflow-Examples/cms-version-history-app)

The button opens Webflow Cloud's deployment flow with this repository preselected.
Sign in, choose the destination, and review the GitHub connection in that flow.
Continue with the source-site and environment setup below. The button does not
supply credentials or establish a CMS history baseline for you.

The URL follows the [official deploy-button format](https://developers.webflow.com/webflow-cloud/deploy-button):

```text
https://webflow.com/dashboard/cloud/deploy?repo=https://github.com/Webflow-Examples/cms-version-history-app
```

### Create an editable copy first

Choose **Use this template → Create a new repository** on GitHub, or fork the
example, then clone **your new repository**:

```bash
git clone https://github.com/YOUR_GITHUB_OWNER/cms-version-history-app.git
cd cms-version-history-app
git diff -- webflow.json
git remote -v
```

The checked-in manifest already contains only `cloud.framework`: there is no
`app_id`, `environment_id`, or source-site identity to reset. Verify your remote
points to your own repository before connecting it to Cloud. When upgrading an
existing installation, preserve that installation's own deployment identity.

Keep `wrangler.json` and its `DB`, `CACHE`, and `SNAPSHOTS` binding names. Its
`local-dev-placeholder` IDs are local placeholders, not production storage IDs.
Cloud provisions environment-specific storage when deployed.

## 2. Identify the source site and create its API token

The **source site** is the Webflow CMS site whose items you want to track. It can
be the same site that hosts the Cloud app, but these are different configuration
concepts.

Create a site API token with:

| Scope | Used for |
|---|---|
| `cms:read` | Collection schemas, backfill, current item reads |
| `cms:write` | Restore, recover, and publish restored items |
| `sites:read` | Site/locale/domain discovery and webhook inspection |
| `sites:write` | Register the CMS webhooks |

`pages:read` is not needed by the current implementation. Do not substitute an OAuth
access token: this app expects the per-webhook signing secrets returned for
site-token registrations.

Record the source site's ID for `WEBFLOW_SITE_ID`. Do not use an app UUID,
environment UUID, collection ID, or the Cloud host site's ID unless that is also
the intended CMS source site.

## 3. Connect your repository in Webflow Cloud

If the one-click flow has already created your Cloud app, continue with that app;
do not create a duplicate. Otherwise create an app in the target site/workspace
and connect **your repository**.
Configure its environment to track your chosen Git branch, commonly `main`.
For a site-attached app, use a mount such as `/app` that is not already occupied.

The exercised deployment shape is a site-attached Next.js Cloud app. If choosing
a root-mounted/standalone app, follow the current Cloud setup flow and run the
same acceptance checks at that base URL.

Use the [Cloud getting-started guide](https://developers.webflow.com/webflow-cloud/getting-started)
for current dashboard/CLI navigation. `webflow cloud init` is an alternative setup
flow; if it scaffolds a starter, do not overwrite this application's source with
that starter.

If you later use CLI tooling, populate the manifest with **your new app and
environment IDs**. Prefer the connected GitHub branch for routine releases.

## 4. Configure the Cloud environment

Set these four required values in the **Cloud environment**, not in the Git repository:

| Variable | Value |
|---|---|
| `WEBFLOW_SITE_TOKEN` | Source-site token from step 2; secret |
| `WEBFLOW_SITE_ID` | Source CMS site ID |
| `APP_PASSWORD` | Private password shared with authorized app users; secret |
| `SESSION_SECRET` | Independent random signing secret; secret |

For example, generate a session secret locally with `openssl rand -hex 32`, then
store it securely in Cloud. Never commit its output.

Leave `WEBFLOW_API_BASE` unset in production. Optional `APP_URL`, preview-domain
overrides, and `JOBS_SECRET` are described in [Configuration](configuration.md).
Each Cloud environment has its own variables and storage; a preview environment
does not automatically inherit the production environment's history or secrets.

If the one-click flow builds the app before these variables are configured, the
build can succeed while the app reports missing configuration. Set the four
required values, apply/deploy the environment changes, then continue to sign-in
and setup. The deploy button does not provide a shared demo password or source token.

## 5. Deploy through GitHub

Push the prepared code to the environment's connected branch. In Cloud, verify:

- The deployment's commit SHA matches your pushed commit.
- The build and deployment both finish successfully.
- The public app URL opens the sign-in page at the configured mount.
- Storage contains `DB` (D1), `CACHE` (KV), and `SNAPSHOTS` (R2).

The application bootstraps/migrates its D1 schema on first database access. No
separate SQL command is required for a fresh installation, and this repository
does not configure `migrations_dir`. Do not apply `scripts/seed-local.sql` to
production; it contains fake test records.

## 6. Register webhooks and capture a baseline

1. Open the app through its intended public URL and sign in.
2. Choose **Run setup** on the overview page. It reads collection schemas and
   creates five site-wide CMS webhook registrations on the source site.
3. Open **History & health** and confirm a signing key is stored for each trigger.
4. Start **Backfill** on a small collection. Wait for completion.
5. Review its items and baseline versions.

Setup points callbacks to `<APP_URL>/api/webhooks/webflow`, or derives the app base
from the request when `APP_URL` is unset. For example:

```text
App:      https://your-host.webflow.io/app
Webhook:  https://your-host.webflow.io/app/api/webhooks/webflow
```

Run setup through the canonical app URL, not a temporary preview URL. If you use
multiple environments, decide deliberately which source site each environment
watches. Re-running setup at a different hostname can create additional registrations;
it does not clean up registrations at the old hostname.

Backfill captures current staged item state, not earlier revisions. Webhooks watch
all collections; choosing which collections to backfill does not filter future
webhook delivery.

## 7. Acceptance checklist

Use an expendable test item on your source site for write checks.

- [ ] Sign-in works; unauthenticated app/API requests are blocked.
- [ ] All five webhook triggers have stored signing keys.
- [ ] Backfill completes and shows a baseline for the test item.
- [ ] Editing the test item in Webflow creates a captured version after refresh.
- [ ] Rapid edits group into a session; **Show every captured edit** reveals them.
- [ ] **Save checkpoint** captures a named point without editing the source item.
- [ ] View live/staging links target the source website and open in a new tab.
- [ ] Restoring the test item as draft preserves its current state first and writes
  the selected content into Webflow as a draft.
- [ ] If live restore is intended, explicitly test it on the expendable item and
  verify publication in Webflow. This changes the published site.
- [ ] History & health has no unexplained pending/failed deliveries.
- [ ] If unattended processing is required, configure the external scheduler and
  verify a recent tick; see [Operations](operations.md#external-scheduler).

Deployment alone does not establish webhook delivery. Keep the acceptance results
with your handoff, including the source site, Cloud environment, mount, and commit SHA.
