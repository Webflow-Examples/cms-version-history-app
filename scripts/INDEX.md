# Repository helper scripts

| Script | Purpose | Invocation / scope |
|---|---|---|
| `check-docs.py` | Offline Markdown links/anchors, JSON examples, npm commands, API/config drift, portable manifest | `python3 scripts/check-docs.py .`; `--help`; `--self-test`. Repository-local validator, no network or app access. |
| `smoke-preview.mjs` | Browser checks against the built Worker, mock API, and isolated local storage | `node scripts/smoke-preview.mjs /absolute/scratch/directory`; requires a build and Chrome. |
| `smoke-production.mjs` | Authenticated screen/read checks after deployment | `node scripts/smoke-production.mjs https://YOUR_HOST/app`; always pass your app URL and supply credentials securely. |
| `mock-webflow-api.mjs` | Limited local collection-metadata mock | `node scripts/mock-webflow-api.mjs`; port 8787. Not a full restore/setup API mock. |
| `simulate-webhooks.mjs` | Signed fake events plus invalid-signature check | `node scripts/simulate-webhooks.mjs http://localhost:3000`; requires local seed and matching source site ID. |
| `seed-local.sql` | Fake collection/webhook fixtures | Apply to an initialized local DB with `wrangler d1 execute ... --local --file scripts/seed-local.sql`. Never production. |

See [Development](../docs/development.md) for full prerequisites and commands.
Fake fixture values are not valid deployment credentials or target IDs.
