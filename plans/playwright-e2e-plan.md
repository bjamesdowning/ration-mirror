# Playwright E2E Testing Strategy for Ration

## Executive Summary

End-to-end tests run against `bun run dev:remote`, using real Cloudflare resources (D1, KV, R2, Vectorize, Workers AI). The implementation is focused on local runs; the same setup transitions to GitLab CI and, later, isolated branch-based preview environments.

- **Data isolation:** Tests clean up after themselves (create → assert → delete via UI).
- **AI features:** Skipped by default; run with `--grep "AI"` when needed.

---

## 1. Environment: dev:remote

### 1.1 What dev:remote Provides

| Resource | Mode | Binding |
|----------|------|---------|
| D1 | Remote (ration-db-dev) | `DB` |
| KV | Remote | `RATION_KV` |
| R2 | Remote (ration-storage-dev) | `STORAGE` |
| Vectorize | Remote (ration-cargo-dev) | `VECTORIZE` |
| Workers AI | Remote | `AI` |

Configured via [`wrangler.dev.jsonc`](wrangler.dev.jsonc) when `CLOUDFLARE_ENV=dev`. The app runs locally; requests hit real Cloudflare services.

### 1.2 BETTER_AUTH_URL

[`wrangler.dev.jsonc`](wrangler.dev.jsonc) sets `BETTER_AUTH_URL: "http://localhost:5173"` — the Vite/React Router dev server port. Playwright baseURL must match.

### 1.3 Prerequisites

- Wrangler authenticated: `wrangler login` or `CLOUDFLARE_API_TOKEN`
- Dev DB migrated: `bun run db:migrate:dev`
- Secrets for dev env: `BETTER_AUTH_SECRET`, Stripe keys (via `wrangler secret put --env dev` or `.dev.vars`)

---

## 2. Playwright Setup

### 2.1 Installation

```bash
bun add -d @playwright/test
bunx playwright install
```

### 2.2 Configuration (playwright.config.ts)

```typescript
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "bun run dev:remote",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

**Important:** `reuseExistingServer: !process.env.CI` — locally you can run `dev:remote` manually and reuse it; in CI Playwright always starts a fresh server.

### 2.3 Directory Structure

```
e2e/
├── fixtures/
│   └── auth.ts              # loginAsDevUser(), authenticated fixture
├── journeys/
│   ├── auth.spec.ts
│   ├── cargo.spec.ts
│   ├── galley.spec.ts
│   ├── manifest.spec.ts
│   └── supply.spec.ts
└── smoke/
    └── navigation.spec.ts
```

### 2.4 Troubleshooting

- **"http://localhost:5173 is already used"** — Another process (e.g. `dev:remote`) is on port 5173. Stop it, or run `dev:remote` first and let Playwright reuse it (`reuseExistingServer: true`).
- **"Timed out waiting from config.webServer"** — `dev:remote` needs more time to start (Cloudflare bindings, remote D1). Ensure port 5173 is free, or start `dev:remote` manually before `test:e2e`.
- **Recommended for local runs:** Start `bun run dev:remote` in one terminal, wait until "Local: http://localhost:5173/" appears, then run `bun run test:e2e` in another — Playwright will reuse the server.

### 2.5 Package Scripts

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:report": "playwright show-report"
  }
}
```

---

## 3. Authentication

### 3.1 Dev Login

- **Credentials:** `dev@ration.app` / `ration-dev` (in [`AuthWidget.tsx`](app/components/auth/AuthWidget.tsx))
- **Visibility:** Only when `import.meta.env.DEV` — dev:remote runs in dev mode, so the button is shown.

### 3.2 Auth Fixture

```typescript
// e2e/fixtures/auth.ts
import { test as base } from "@playwright/test";

export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Dev Login" }).click();
    await page.waitForURL(/\/(hub|select-group)/);
    if (page.url().includes("select-group")) {
      const btn = page.getByRole("button", { name: /select|create|personal/i });
      await btn.first().click();
      await page.waitForURL("/hub");
    }
    await use(page);
  },
});
```

---

## 4. Real Services: No Mocking

Because dev:remote uses real D1, KV, Vectorize, and AI:

- **AI endpoints** — Run as a smaller subset, skipped by default. Tests that hit Workers AI (scan, meal generate, import URL) are in `test.describe("AI features")` with `test.skip()`. Run with `bun run test:e2e --grep "AI"` when needed. Keeps default suite fast and cheap.
- **Stripe** — Mock or skip checkout flows (external redirect). Use `page.route()` to stub `/api/checkout` if needed.
- **Data isolation** — Tests clean up after themselves. Each test that creates data (cargo, galley, supply) performs a delete via the UI at the end of the test. This keeps `ration-db-dev` tidy and avoids accumulation of test data. Pattern: create → assert → delete → assert removed.

---

## 5. GitLab CI Integration

### 5.1 Transition: Local → CI

| Aspect | Local | GitLab CI (feature branch) |
|--------|-------|----------------------------|
| **Server** | `bun run dev:remote` (manual or via webServer) | Playwright starts `dev:remote` via webServer |
| **baseURL** | `http://localhost:5173` | Same (runner is same machine as server) |
| **Cloudflare auth** | `wrangler login` | `CLOUDFLARE_API_TOKEN` |
| **Secrets** | `.dev.vars` / wrangler secrets | GitLab CI variables (masked) |
| **reuseExistingServer** | `true` (optional manual start) | `false` (always fresh) |

### 5.2 Required GitLab CI Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `CLOUDFLARE_API_TOKEN` | Masked | Wrangler access to Cloudflare (dev env) |
| `CLOUDFLARE_ACCOUNT_ID` | Variable | Cloudflare account (if not in wrangler.jsonc) |
| `BETTER_AUTH_SECRET` | Masked | Auth sessions (passed to wrangler) |
| `STRIPE_SECRET_KEY` | Masked | Stripe API (for checkout tests if run) |
| `STRIPE_PUBLISHABLE_KEY` | Variable | Stripe client |
| `STRIPE_WEBHOOK_SECRET` | Masked | Webhooks (if tested) |

Secrets can be injected via `.dev.vars` generation in CI or `wrangler secret put` (requires API token with secret write). Simpler: write a `.dev.vars` file from CI variables before running, e.g.:

```yaml
- echo "BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET" >> .dev.vars
- echo "STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY" >> .dev.vars
# ... etc
```

Wrangler loads `.dev.vars` for local/dev when present.

### 5.3 Example .gitlab-ci.yml (E2E Job)

```yaml
e2e:
  stage: test
  image: oven/bun:latest
  variables:
    CI: "true"
  before_script:
    - bun install --frozen-lockfile
    - bun run db:migrate:dev
    # Optional: populate .dev.vars from CI variables for secrets
    - |
      if [ -n "$BETTER_AUTH_SECRET" ]; then
        echo "BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET" >> .dev.vars
        echo "STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY" >> .dev.vars
        echo "STRIPE_PUBLISHABLE_KEY=$STRIPE_PUBLISHABLE_KEY" >> .dev.vars
        echo "STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET" >> .dev.vars
      fi
    - bunx playwright install --with-deps chromium
  script:
    - bun run test:e2e
  artifacts:
    when: on_failure
    paths:
      - playwright-report/
      - test-results/
```

### 5.4 When to Run E2E

- **Branches:** Run on merge requests targeting main (or develop)
- **Scheduling:** After `test:unit` and `typecheck` pass
- **Duration:** dev:remote startup + AI calls can add 1–3 minutes; budget ~5–10 min for full E2E job

### 5.5 Future: Branch-Based Preview Environments

For stricter isolation (e.g. per-MR preview deployments):

1. **Deploy job:** Deploy to a preview URL (e.g. `ration-${CI_COMMIT_REF_SLUG}.workers.dev`) on each feature branch
2. **Test job:** `PLAYWRIGHT_BASE_URL=https://ration-xxx.workers.dev bun run test:e2e` with `webServer` disabled
3. **BETTER_AUTH_URL:** Must match deployed URL for auth callbacks

The current dev:remote setup transitions cleanly: same tests, different baseURL. No changes to spec files required.

---

## 6. Test Priorities and Journeys

| Spec | Scope | Notes |
|------|-------|-------|
| `auth.spec.ts` | Login, redirect, select group | Core path for all other tests |
| `navigation.spec.ts` | Hub nav links | Fast smoke |
| `cargo.spec.ts` | Add item, edit, delete | Real D1 writes |
| `galley.spec.ts` | Add meal, Match Mode | Vectorize for matching |
| `manifest.spec.ts` | Plan week, add slot, consume | Multi-step flow |
| `supply.spec.ts` | Add item, generate from meals | Supply list logic |

Use unique identifiers (timestamps, UUIDs) for created data to avoid conflicts across parallel runs or shared dev DB.

---

## 7. Refactor Opportunities (unchanged)

- Add optional `data-testid` for critical paths (Dev Login, IngestForm, ConfirmDialog)
- Extract dev credentials to config/env for e2e-specific users
- Form field name constants for maintainability

---

## 8. Summary

| Decision | Choice |
|----------|--------|
| **Server** | `bun run dev:remote` |
| **Resources** | Real D1, KV, R2, Vectorize, AI (no mocking) |
| **baseURL** | `http://localhost:5173` |
| **Auth** | Dev Login (dev@ration.app) |
| **CI** | Same webServer command; `reuseExistingServer: false` when `CI=true` |
| **CI Prereqs** | `CLOUDFLARE_API_TOKEN`, secrets, `db:migrate:dev` |
