# Feature flags (Cloudflare Flagship)

Ration uses [Cloudflare Flagship](https://developers.cloudflare.com/flagship/) for gradual feature rollouts without redeploying code. Infrastructure lives in `app/lib/feature-flags/`; flag **values** are managed in the Cloudflare dashboard.

## When to use Flagship vs wrangler vars

| Mechanism | Use for |
|-----------|---------|
| **Flagship** (`isFeatureEnabled`) | Gradual rollout, user targeting, percent rollaps, kill-switch without redeploy |
| **Wrangler vars** (`MCP_OAUTH_ENABLED`, `REVENUECAT_FULFILLMENT_ENABLED`) | Rare, deploy-time ops toggles |

## Prerequisites (one-time)

1. Cloudflare dashboard → **Compute → Flagship** → create app `ration` (and `ration-dev` for local/remote dev).
2. Copy each **app ID** into wrangler:
   - Production: [`wrangler.jsonc`](../wrangler.jsonc) → `flagship[0].app_id`
   - Dev/local: [`wrangler.dev.jsonc`](../wrangler.dev.jsonc), [`wrangler.local.jsonc`](../wrangler.local.jsonc), and `env.dev` in `wrangler.jsonc`
3. Run `bun run cf-typegen` after changing bindings.

`RATION_ENV` is set to `production` (prod) or `development` (dev) and passed as the `environment` targeting attribute.

## Architecture

```
Dashboard (Flagship) → propagated config → env.FLAGS binding → flags.server.ts → routes
```

- **`registry.ts`** — flag keys and code defaults (source of truth for key names in repo)
- **`context.server.ts`** — trusted Flagship context builders:
  - `buildWebFlagContext` — Hub/SSR document loads and web APIs (server-owned `clientPlatform: "web"` + `APP_VERSION`; ignores `X-Ration-Client`)
  - `buildMobileFlagContext` — iOS mobile APIs (`clientPlatform: "ios"`; marketing version from `X-Ration-Client` when valid)
  - `buildAgentFlagContext` — MCP stays `mcp` + web `APP_VERSION`. First-party Copilot inherits the Ask client's `web`/`ios` identity when provided; otherwise `copilot` + `APP_VERSION`. Never invent an iOS marketing version for external MCP.
  - `buildSystemFlagContext` — background/queue jobs
  - `buildFlagContext` — **deprecated**; legacy helper that still honors `X-Ration-Client` (do not use for Hub UI)
- **`flags.server.ts`** — `isFeatureEnabled`, `getClientSafeFlags`
- **Root loader** — exposes `clientFlags` for web UI (only `clientVisible` entries). Root must evaluate with `buildWebFlagContext` so Flagship `clientPlatform == web` rules match; root `clientFlags` are the web UI source of truth for meal/cargo/preferences/Manifest chrome.

### Fallback order

1. `FEATURE_FLAG_OVERRIDES` secret (emergency kill, JSON e.g. `{"my-flag":false}`). Applies to every platform, including shipped iOS.
2. Registry `iosAlwaysOn: true` and the context is `clientPlatform: "ios"` with `clientVersion` ≥ `IOS_FEATURE_FLOOR` (`1.5.0`, in `flags.server.ts`) → **on** without asking Flagship.
3. `env.FLAGS.getBooleanValue(key, false, context)`
4. Registry `defaultEnabled` (always `false` for new flags)

### Shipped on iOS (`iosAlwaysOn`)

iOS 1.5.x ships every flagged iOS feature enabled. Entries marked `iosAlwaysOn` are on for iOS ≥ `IOS_FEATURE_FLOOR`; Flagship still decides web, MCP, and iOS builds below the floor. Copilot tools inherit the Ask client's identity (`originating-client.server.ts`), so Ask from iOS ≥ 1.5.0 gets the same answer as the iOS app. iOS builds below `IOS_MIN_SUPPORTED_VERSION` (`wrangler.jsonc`) get **426** `upgrade_required` from `workers/app.ts` on non-exempt mobile routes (see README → *Minimum iOS version*). Only `app-review-login`, `apple-web-login`, and `nutrition-async-recompute` are not `iosAlwaysOn`; `registry.test.ts` pins that list.

When a new iOS feature needs a flag, leave `iosAlwaysOn` off until the build that ships it is the floor, or gate it on a higher client version in the route.

## Adding a flag to a feature

Use the **`/add-feature-flag`** Cursor command for the full checklist. Summary:

1. Add entry to `FLAG_REGISTRY` in [`app/lib/feature-flags/registry.ts`](../app/lib/feature-flags/registry.ts) with `defaultEnabled: false`.
2. Create matching **boolean** flag in Flagship dashboard (disabled, default variant `false`).
3. Configure targeting (specific rules first):
   - `environment equals "development"` for dev-only
   - `userId` allowlist for team testing
   - Percent rollout on `userId` → 5% → 25% → 50% → 100%
   - For signed-out surfaces (auth pages, public landing CTAs), `userId` is not available yet. Use a dev/staging environment, `FEATURE_FLAG_OVERRIDES` outside production, or a small percentage rollout on a non-user attribute.
4. Gate server-side: `await isFeatureEnabled(env, "my-flag", context)` at loader/action/lib.
5. If UI needs the flag: `clientVisible: true` → read `clientFlags` from root loader data.
6. Unit tests: mock `env.FLAGS.getBooleanValue` for on **and** off paths.
7. Run `bun run flag:check`, `bun run lint`, `bun run typecheck`, `bun run test:unit`.

### Deploy order

1. Push code with flag **disabled** in Flagship → no user impact (`/long-commit` enforces this for solo trunk ships).
2. Create/configure dashboard flag if not done before push.
3. Enable for the right context (`userId` for authenticated surfaces; environment/staging or percent rollout for signed-out surfaces) → percent rollout → 100%.
4. When stable: remove code path → deploy → delete flag from dashboard.

## Local development

- `wrangler dev` uses the **live** Flagship app for the configured `app_id` ([docs](https://developers.cloudflare.com/flagship/configuration/#local-development)).
- There is **no local flag store**. Point local config at a dev Flagship app.
- Override locally: `wrangler secret put FEATURE_FLAG_OVERRIDES` with JSON, or use `.dev.vars` for Miniflare.

## CI/CD

- `.gitlab-ci.yml` does **not** call Flagship. Flags are toggled in the Cloudflare dashboard.
- Pushing to `main` deploys code via Workers Builds; Flagship controls exposure independently.
- Ship flag-gated code with the dashboard flag **off** first.
- Solo trunk workflow: `/long-commit` classifies the change, requires Flagship for user-visible work (via `/add-feature-flag` when missing), runs local quality gates, then commits/pushes. Dogfood by enabling your `userId` in Flagship after deploy — not via a full staging Worker or MR preview DB.

## Security

- Default **off** for all release flags.
- **Server-side enforcement** required — UI-only gating is insufficient.
- Do not put secrets or unnecessary PII in evaluation context (`userId`, `country`, `plan`, `environment` only).
- Never expose Flagship config or tokens to the client — only boolean `clientFlags`.

## Testing

```typescript
const getBooleanValue = vi.fn().mockResolvedValue(true);
const env = {
  ...createMockEnv(),
  FLAGS: { getBooleanValue } as unknown as Flagship,
};
```

## Example: `apple-web-login` (shipped)

Web Sign in with Apple is gated behind this flag. Registry entry in [`registry.ts`](../app/lib/feature-flags/registry.ts):

```typescript
"apple-web-login": {
  defaultEnabled: false,
  description: "Sign in with Apple on web",
  clientVisible: true,
  clientKey: "appleWebLogin",
},
```

**Operator:** Create matching boolean flag in Flagship dashboard (disabled). Set Apple web secrets (`APPLE_SERVICES_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`) **and** `APPLE_APP_BUNDLE_IDENTIFIER` before enabling — web credentials without the bundle ID are treated as misconfig (button stays hidden; provider not registered). Config is in **Apple Developer** Identifiers/Keys, not App Store Connect. Mobile Apple auth is **not** gated by this flag.

**Rollout:** Because this is a signed-out auth surface, `userId` targeting will not show the button before login. Test on a dev/staging Flagship app or with `FEATURE_FLAG_OVERRIDES`, then set the production default variation to `on` (`wrangler flagship flags set <APP_ID> apple-web-login --variation on`). Full portal steps: README §7.1 Web Apple (operator setup).

## AI ops kill switches (shipped)

Permanent boolean kill switches for billed AI pipelines. Registry `defaultEnabled: false` (fail closed if Flagship is unavailable). Because these features are already live, create Flagship flags with default variation **ON** in production **before** or at deploy of gating code, then flip off only for incidents.

| Flag key | Client key | Server choke point |
|----------|------------|--------------------|
| `ai-import-url` | `aiImportUrl` | `submitRecipeImport` (parent) |
| `ai-import-web` | `aiImportWeb` | Website lane (plain fetch / Supadata scrape / client HTML) |
| `ai-import-social` | `aiImportSocial` | Social lane (TikTok / Instagram / YouTube) |
| `ai-import-photo` | `aiImportPhoto` | Photo / screenshot lane |
| `ai-scan-receipt` | `aiScanReceipt` | `submitVisualScan` |
| `ai-dock-from-receipt` | `aiDockFromReceipt` | Supply scan-match / scan-complete |
| `ai-generate-meal` | `aiGenerateMeal` | `submitMealGenerate` |
| `ai-plan-week` | `aiPlanWeek` | `submitPlanWeek` |

All eight are `iosAlwaysOn`: on for iOS ≥ 1.5.0, Flagship-controlled elsewhere. The iOS kill switch is `FEATURE_FLAG_OVERRIDES`, which also kills web and MCP.

**Operator matrix:** Parent `ai-import-url` plus the matching lane flag must be on for that submit path. `ai-scan-receipt` off kills Cargo and Dock AI spend; `ai-dock-from-receipt` off leaves Cargo scan available. Asserts throw **403** + `FEATURE_DISABLED` before credit debit. Mobile bootstrap: `GET /api/mobile/v1/session` returns `clientFlags`. Emergency bulk kill: `FEATURE_FLAG_OVERRIDES` JSON on the `ration` Worker, e.g. `{"ai-scan-receipt":false,"ai-import-url":false,...}`.

## Nutrition flags

| Flag key | Client key | Purpose |
|----------|------------|---------|
| `nutrition-engine` | `nutritionEngine` | USDA resolve, recipe/cargo snapshots, Galley panel |
| `nutrition-ai-estimate` | `nutritionAiEstimate` | AI nutrient fill on AI ingest paths after USDA miss |
| `nutrition-manifest` | `nutritionManifest` | Manifest daily totals / intake |
| `nutrition-goals` | `nutritionGoals` | Personal goals and vs-goal views |
| `nutrition-cook-log-split` | `nutritionCookLogSplit` | Shared Cook vs private Eat; Galley Cook→Manifest bridge |
| `nutrition-async-recompute` | _(not clientVisible)_ | Queue stub for async nutrition recompute |
| `nutrition-intake-notes` | `nutritionIntakeNotes` | Optional private Eat notes (≤280) on intake rows |
| `nutrition-cross-org-diary` | `nutritionCrossOrgDiary` | Personal intake summary/history aggregates across kitchens (user-global diary) |

## Supply list library

| Flag key | Client key | Purpose |
|----------|------------|---------|
| `supply-multi-lists` | `supplyMultiLists` | Saved lists that pull into Live Supply. Default **off**; `iosAlwaysOn`. Only Live can be checked off or docked, whether or not the flag is on. Quick-add on Live works with the flag off. |

Web and MCP stay Flagship-controlled. Killing the flag hides every non-Live surface (HTTP 403 `FEATURE_DISABLED` on catalog routes; 404 on legacy `:id`/share for Saved) while Live remains fully operational and saved rows stay intact.

All default **off**. Create matching Flagship flags before enabling. Seed local nutrition D1 with `bun run db:nutrition:seed:local`.

Hub/SSR and web APIs evaluate Flagship with `buildWebFlagContext` (server-owned `clientPlatform: "web"` + `APP_VERSION`). Mobile uses `buildMobileFlagContext` + validated `X-Ration-Client`. External MCP uses `buildAgentFlagContext` with `clientPlatform` `mcp` and web `APP_VERSION` — never invent an iOS marketing version for MCP. First-party Copilot Ask inherits the originating client's `web` or `ios` identity (iOS marketing version from `X-Ration-Client` when the connection is Bearer-authenticated). Product flags therefore match Hub / iOS without a separate `copilot` platform cohort. Connect-time `ration-copilot` still evaluates from the HTTP request.

### Nutrition rollout

iOS ≥ 1.5.0 gets every nutrition flag except `nutrition-async-recompute` through `iosAlwaysOn`; no Flagship rule is needed for iOS. For web and MCP, keep registry `defaultEnabled: false` and Flagship default variation **off**, and enable by platform (`clientPlatform` equals `web` / `mcp`). Do **not** use `FEATURE_FLAG_OVERRIDES` to turn nutrition flags **on** in production; that secret is for emergency **kill** (`false`) or local/dev overrides. Copilot Ask needs no extra rule: tools inherit the Ask client's `ios` or `web` identity. History of the 1.4.x platform/version rollout: [nutrition-rollout.md](nutrition-rollout.md).

Consent / Art. 9 notes: [nutrition-dpia-notes.md](nutrition-dpia-notes.md). After help article changes, sync Copilot AI Search.

## Example: `app-review-login` (shipped)

App Store / TestFlight review email+password login on iOS. Registry:

```typescript
"app-review-login": {
  defaultEnabled: false,
  description: "App Store / TestFlight review email+password login on iOS",
  clientVisible: true,
  clientKey: "appReviewLogin",
},
```

**Operator:** Create matching boolean flag in Flagship (disabled). Seed the review account with the local-only script `bun scripts/seed-account/seed-app-review-demo.ts --remote` (under gitignored `scripts/seed-account/`) and set `APP_REVIEW_DEMO_EMAIL`, `APP_REVIEW_DEMO_PASSWORD`, `APP_REVIEW_DEMO_USER_ID`. Enable the flag only during review windows; disable afterward. iOS shows the Password field when the email matches the review address; the server enforces the flag on `POST /api/mobile/v1/auth/review-login`. Checklist: [`plans/app-review-notes.md`](../plans/app-review-notes.md).

## References

- [Flagship overview](https://developers.cloudflare.com/flagship/)
- [Get started](https://developers.cloudflare.com/flagship/get-started/)
- [Best practices](https://developers.cloudflare.com/flagship/best-practices/)
- [Targeting](https://developers.cloudflare.com/flagship/targeting/)
- [Percentage rollouts](https://developers.cloudflare.com/flagship/targeting/percentage-rollouts/)
