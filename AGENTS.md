# Repository instructions for coding agents

## Start here

Read `README.md`, then the guide relevant to the task:

- Installation/configuration: `docs/installation.md`, `docs/configuration.md`.
- Code changes/integration: `docs/architecture.md`, `docs/api.md`.
- Verification: `docs/development.md`.
- Operational changes: `docs/operations.md`.
- Installing this in another project: `docs/agent-handoff.md`.

This is an MIT-licensed example template. Use `src/` and tests as the implementation
source of truth, and distinguish example behavior from a managed Webflow feature.

## Target and secrets

- Inspect Git status and preserve pre-existing user changes.
- The template's `webflow.json` intentionally contains only `cloud.framework`.
  Establish the recipient's app/environment identity during setup. Never copy IDs
  from another installation or reset a working installation's identity.
- Distinguish the source CMS site, Cloud host site, app, environment, and mount.
  Never infer that they are the same or copy IDs from test/example data.
- Keep `.dev.vars`, `.mcp.json`, credentials, session cookies, and webhook/job
  signing secrets out of commits and logs. Do not request secret values in a handoff
  document. Test fixtures contain fake credentials and remain local-only.

## Implementation constraints

- One source site and its primary CMS locale per installation. Locale support is
  not a small UI toggle: keys, queries, blobs, backfill, and restores need changes.
- Persist verified incoming events before processing; preserve retry/replay behavior.
- Preserve per-item leases, operation keys, and the restore journal. Do not bypass
  an uncertain-outcome guard to make a test or retry succeed.
- Capture actual current state before restore, check the reviewed hash, and inspect
  item-level publish results. There is no atomic Webflow compare-and-swap guarantee.
- Checkpoint grouping is presentation only; do not silently delete history or change
  capture policy to reduce timeline noise.
- Update `schema.ts`, fresh bootstrap SQL, and a **new** migration together. Do not
  rewrite an already-deployed migration. Keep migrations compatible with existing data.
- Runtime code runs on Workers. Use existing bindings, WebCrypto, and browser-stream
  APIs; Node-only helpers belong in local scripts/tests, not request handlers.
- Client API requests use `apiPath()`. Keep app mount paths separate from public
  website preview bases. Validate URLs and preserve new-tab link protections.
- Reuse the existing Tailwind tokens and components. Use semantic buttons/links,
  labels, visible keyboard focus, and mobile-safe layouts.
- Do not claim static-page history, scheduled publishing, user roles, immutable
  auditing, or scale guarantees merely because research notes discuss them.

## Verify changes

For relevant runtime changes: `npm test`, `npm run typecheck`, `npm run lint`, and
`npx opennextjs-cloudflare build`. Use `scripts/smoke-preview.mjs` for UI/runtime
verification with isolated local storage. See `docs/development.md` for prerequisites.

For docs-only changes, validate links, examples, configuration/route names, and
`git diff --check`; do not mutate real CMS content to test prose.

## Release and handoff

- Normal deployment is a push to the GitHub branch connected to the intended Cloud
  environment. Commit/push only when authorized by the user. Do not substitute a
  CLI deployment without explicit direction.
- `npm run deploy` invokes the Webflow CLI; it is not a test command. Verify the
  intended app and environment before any explicitly requested CLI deployment.
- Verify Cloud's successful deployment status and exact commit SHA before calling
  a release live. Report blocked authenticated checks accurately.
- Never perform a real restore, publish, webhook removal, or storage deletion merely
  to demonstrate a successful build. Use disposable test items with explicit scope.
- Final handoff: changed behavior/files, tests actually run, commit/deployment status,
  configuration still required, and known limits. Do not include credentials.
