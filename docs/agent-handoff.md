# Handoff for a human or coding agent

[Documentation index](README.md) · [Repository instructions](../AGENTS.md)

## Ready-to-use implementation brief

Copy this brief into the target project's coding session and fill in non-secret values:

```text
Integrate the CMS Version History example into my project using this repository.

Target Git repository/branch: <repository and branch>
Source Webflow CMS site ID: <source site ID>
Cloud host site/app/environment: <existing IDs, or "create a new app">
App mount: </app or another intended path>
Integration mode: <separate Cloud app / merge into existing Next.js app>
Production website base: <auto-discover or URL>
Staging website base: <auto-discover or URL>
Credential provisioning: <environment variables already set / owner will configure>
Allowed verification: <local only / named disposable CMS test item>
Deployment authorization: <prepare only / commit and push the specified branch>

Read README.md and AGENTS.md first. Follow docs/installation.md for a new copy,
or docs/architecture.md for an embedded integration. Inspect the target before
editing; preserve its existing work, auth, routes, styling, and Cloud identity.

Implement the shipped CMS item history/checkpoint/restore feature set, not features
mentioned only in research notes. Preserve durable ingest, primary-locale isolation,
restore preflight/journaling, mount-aware routes, and published-site preview semantics.

The template has no attached deployment identity. Ask for missing non-secret target
details and let the owner provision credentials securely. Use fake credentials and
isolated storage for tests. Do not mutate a real CMS item without the allowed scope.

Validate the target's tests and Workers build. If deployment is authorized, use its
GitHub-connected workflow and verify the exact commit in Cloud. Hand back the setup
steps completed, tests actually run, unresolved configuration, and known limitations.
```

## Review checklist before implementation

- [ ] Source site and Cloud host identity are explicit and distinct where necessary.
- [ ] Runtime/toolchain and the intended mount are compatible.
- [ ] New deployment uses the neutral template manifest or the recipient's own IDs.
- [ ] Required site-token scopes and the shared-password access model are understood.
- [ ] Dedicated storage or a reviewed table/binding namespace prevents collisions.
- [ ] Webhook URL belongs to the intended environment; setup side effects are authorized.
- [ ] Primary-locale-only capture and published-only preview links fit the use case.
- [ ] Full retained field snapshots, raw inbox payloads, and storage growth are acceptable.
- [ ] Recovery's new item IDs, reference/media limits, and restore concurrency window
  are understood.

## Implementation evidence to request

For a separate copy, require the [installation acceptance checklist](installation.md#7-acceptance-checklist).
For an embedded integration, also request a source/route/binding map showing which
parts were reused and how authorization was preserved.

Evidence should distinguish:

1. **Local behavior tests** with fake data and isolated storage.
2. **Build success** for the target runtime and mount.
3. **Cloud deployment success** for a specific commit and environment.
4. **Authenticated app checks**, which need valid app credentials.
5. **Real webhook/restore checks**, which require a disposable item and permission to write.

Passing one category is not evidence that the others passed. Domain links being
constructed correctly also does not prove the destination item has been published.

## Final handoff template

```text
Repository / commit:
Cloud app / environment / mount:
Source CMS site:
Public app URL:
Deployment status:

Configured (names only, no secret values):
Bindings verified:
Webhook registration / delivery verified:
Backfill baseline status:
Preview-domain discovery or overrides:
External scheduler connected and last tick:

Tests run and results:
Real CMS operations performed (item IDs and scope):
Blocked or unperformed checks:
Remaining setup / product limitations:
Documentation paths for the next maintainer:
```

For a review-only task, fill in only verified information and leave operational
steps marked "not performed". Do not provision or deploy merely to complete this template.
