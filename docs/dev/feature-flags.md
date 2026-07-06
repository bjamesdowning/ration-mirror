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
- **`context.server.ts`** — `buildFlagContext(request, env, session?)`
- **`flags.server.ts`** — `isFeatureEnabled`, `getClientSafeFlags`
- **Root loader** — exposes `clientFlags` for UI (only `clientVisible` entries)

### Fallback order

1. `FEATURE_FLAG_OVERRIDES` secret (emergency kill, JSON e.g. `{"my-flag":false}`)
2. `env.FLAGS.getBooleanValue(key, false, context)`
3. Registry `defaultEnabled` (always `false` for new flags)

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

1. Merge code with flag **disabled** in Flagship → no user impact.
2. Create/configure dashboard flag if not done before merge.
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

**Operator:** Create matching boolean flag in Flagship dashboard (disabled). Set Apple web secrets (`APPLE_SERVICES_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`) before enabling. Mobile Apple auth is **not** gated by this flag.

**Rollout:** Because this is a signed-out auth surface, `userId` targeting will not show the button before login. Test on a dev/staging Flagship app or with `FEATURE_FLAG_OVERRIDES` outside production, then use a small percentage rollout on production before App Store publish.

## References

- [Flagship overview](https://developers.cloudflare.com/flagship/)
- [Get started](https://developers.cloudflare.com/flagship/get-started/)
- [Best practices](https://developers.cloudflare.com/flagship/best-practices/)
- [Targeting](https://developers.cloudflare.com/flagship/targeting/)
- [Percentage rollouts](https://developers.cloudflare.com/flagship/targeting/percentage-rollouts/)
