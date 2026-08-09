# Add Feature Flag

Gate a **specific feature** behind Cloudflare Flagship. Infrastructure (`app/lib/feature-flags/`, wrangler binding) must already be in place — see [docs/dev/feature-flags.md](../docs/dev/feature-flags.md).

## Inputs (ask if missing)

- **Flag key** — kebab-case (e.g. `new-checkout-flow`)
- **Description** — one line for `FLAG_REGISTRY`
- **clientVisible?** — does the UI need to show/hide based on the flag?
- **Touchpoints** — loader, action, component files to gate

## Steps

1. Confirm `flagship` binding exists in `wrangler.jsonc` with a valid `app_id` (not `REPLACE_WITH_*`).

2. Add entry to [`app/lib/feature-flags/registry.ts`](../app/lib/feature-flags/registry.ts):
   ```typescript
   "your-flag-key": {
     defaultEnabled: false,
     description: "...",
     clientVisible: true, // optional
     clientKey: "yourFlagKey", // optional camelCase for clientFlags
   },
   ```

3. **Operator:** Create matching boolean flag in Cloudflare dashboard → Compute → Flagship → `ration` app. Leave **disabled**; default variant `false`.

4. Add server gate at the lowest enforcement point:
   ```typescript
   import { buildFlagContext, isFeatureEnabled } from "~/lib/feature-flags/flags.server";

   const context = buildFlagContext(request, env, session);
   if (!(await isFeatureEnabled(env, "your-flag-key", context))) {
     // reject or fallback
   }
   ```

5. If `clientVisible: true`, read from root loader `clientFlags` in React — no extra loader work needed.

6. Add unit tests — mock `env.FLAGS.getBooleanValue` for enabled **and** disabled paths.

7. Run quality gates:
   ```bash
   bun run flag:check
   bun run lint
   bun run typecheck
   bun run test:unit
   ```

8. Docs: update only if the workflow changed; registry + dashboard are usually enough.

9. Commit message must include the flag key and note that the dashboard flag must exist before enabling.

## Deploy order (trunk-based)

Solo workflow pushes to `main` (Workers Builds = production). There is no MR gate for day-to-day work; `/long-commit` enforces Flagship before push.

1. Push/commit with flag **disabled** in Flagship → zero user impact.
2. Create/configure dashboard flag if not done pre-push (disabled, default `false`).
3. Dogfood: enable your `userId` allowlist rule → percent rollout → 100%.
4. After stable: remove flag from code → push → delete from dashboard.

When invoked from `/long-commit`, leave the dashboard flag **off**; report dogfood steps in the final report instead of enabling it.

## Targeting tips

- Pass stable `userId` in context for rollout stickiness.
- Put specific rules before broad catch-alls ([targeting docs](https://developers.cloudflare.com/flagship/targeting/)).
- Progressive rollout: 5% → 25% → 50% → 100%.

## Emergency kill

```bash
wrangler secret put FEATURE_FLAG_OVERRIDES
# {"your-flag-key": false}
```
