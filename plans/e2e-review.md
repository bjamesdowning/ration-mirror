# E2E test inventory and review notes

Generated during the E2E review pass. See [playwright.config.ts](../playwright.config.ts) for timeouts, workers, and project definitions.

## Spec → Playwright project matrix

| File | Project(s) | Auth | Mocks / fixtures | Skips / branches |
|------|------------|------|------------------|-------------------|
| `e2e/auth.setup.ts` | **setup** | Dev Login | — | Group loop, onboarding dismiss |
| `e2e/smoke/home.spec.ts` | chromium-public | No | — | — |
| `e2e/smoke/blog.spec.ts` | chromium-public | No | — | — |
| `e2e/smoke/legal.spec.ts` | chromium-public | No | — | — |
| `e2e/smoke/tools.spec.ts` | chromium-public | No | — | — |
| `e2e/journeys/shared.spec.ts` | chromium-public | No | — | HTTP 404 assertions |
| `e2e/smoke/navigation.spec.ts` | chromium-auth | `authenticatedPage` | — | — |
| `e2e/journeys/cargo.spec.ts` | chromium-auth | `authenticatedPage` | — | Optional merge modal |
| `e2e/journeys/galley.spec.ts` | chromium-auth | `authenticatedPage` | — | `test.skip`: AI meal (grep `AI`) |
| `e2e/journeys/manifest.spec.ts` | chromium-auth | `authenticatedPage` | — | — |
| `e2e/journeys/supply.spec.ts` | chromium-auth | `authenticatedPage` | — | — |
| `e2e/journeys/settings.spec.ts` | chromium-auth | `authenticatedPage` | `avatar.png` | Conditional `test.skip` (group / avatar input) |
| `e2e/journeys/scan.spec.ts` | chromium-auth | `authenticatedPage` | Route mock + `sample-scan.png` | Zero-credits → Pricing link only |
| `e2e/journeys/auth.spec.ts` | **auth** (isolated) | No | Route mock magic-link POST | — |

**Dependency:** `chromium-auth` runs after **setup** and reads `e2e/.auth/user.json`.

## Flake-oriented commands (maintainers)

```bash
# Baseline (starts dev:local unless PLAYWRIGHT_BASE_URL is set)
bun run test:e2e

# CI-like retries + GitHub reporter
CI=true bun run test:e2e

# Repeat each test to surface flakes (example: 3×)
bun x playwright test --repeat-each=3

# Scope to suspected files from prior failures
bun x playwright test e2e/auth.setup.ts e2e/journeys/shared.spec.ts e2e/journeys/auth.spec.ts --repeat-each=5
```

## Baseline run (2026-04-13)

- **Command:** `bun run test:e2e`
- **Result:** **31 passed**, **2 skipped** (AI meal `test.skip` in `galley.spec.ts`; conditional skip in `settings.spec.ts` when avatar/group preconditions fail)
- **Duration:** ~37s (2 workers, local webServer)

## Repeat-run summary (2026-04-13)

- **Command:** `CI=true bun x playwright test --repeat-each=3` (97 test invocations)
- **Result before fix:** **90 passed**, **6 skipped** (repeated skips), **1 flaky** — `e2e/journeys/auth.spec.ts` “submitting email shows check-inbox success state” (real API hit; UI showed “Something went wrong”)
- **Root cause:** E2E mocked `**/api/auth/magic-link/send**`, but **Better Auth 1.4** uses **POST `/api/auth/sign-in/magic-link`**. The mock never matched; outcomes depended on the real handler (rate limits, email, DB), hence flakes.
- **After fix:** `bun x playwright test e2e/journeys/auth.spec.ts --repeat-each=10` with `CI=true` → **70 passed**, **0 flaky** (route registered before `goto`, correct path, JSON content-type).

## Triage: hotspots vs prior session failures

Prior quick-commit session noted:

1. **auth.setup** — Dev Login / hub navigation timeout → correlate with cold `dev:local`, DB not migrated, or Dev user missing.
2. **shared.spec** — `net::ERR_ABORTED` → parallel projects + single dev server; mitigated by stable server and not tearing down mid-run.
3. **auth.spec** — “Check your inbox” — **fixed** by mocking `/api/auth/sign-in/magic-link` (see above).

| Hotspot | Specs | Notes |
|---------|-------|--------|
| Auth setup | All chromium-auth | Setup failure blocks dependent tests |
| Parallel + dev server | shared, smoke | `ERR_ABORTED` under load or restart |
| Magic link mock | auth.spec | Must match Better Auth `sign-in/magic-link` POST |
| Credits | scan.spec | Early return when Pricing visible |
| Group / avatar | settings.spec | Skips instead of hard fail |
| Vectorize local | cargo/galley (server logs) | `Binding VECTORIZE needs to be run remotely` — logged on server; tests still passed |

## Follow-ups (optional)

- ~~Add `[env.local]` to Wrangler config~~ — fixed by using `RATION_DEV_MODE=local` instead of `CLOUDFLARE_ENV=local` and `remoteBindings: false` in `vite.config.ts` (2026-06-09).
- GitLab CI currently runs unit tests only ([`.gitlab-ci.yml`](../.gitlab-ci.yml)); adding a Playwright job would require browsers + `db:migrate:local` + secrets strategy.

## Review run log

| Step | Outcome |
|------|---------|
| Inventory | Matrix above |
| Baseline `bun run test:e2e` | 31 passed, 2 skipped |
| `CI=true` + `--repeat-each=3` | 1 flaky (auth magic-link mock path) |
| Fix `e2e/journeys/auth.spec.ts` | Correct route + register before navigation |
| Verification `auth.spec` ×10 | 70 passed, 0 flaky |
| Post-fix `CI=true` full suite `--repeat-each=3` | 91 passed, 6 skipped, **0 flaky** (~1.3m) |
