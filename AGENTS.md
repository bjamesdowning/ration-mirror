# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Ration is a Cloudflare Workers-based pantry management app (React Router v7 SSR + Drizzle ORM + D1). The package manager is **bun**. All commands are documented in `package.json` scripts and the project's `.cursor/rules/ration-master.mdc`.

### Local dev server (no Cloudflare auth)

The default `bun run dev` requires Cloudflare authentication because the `@cloudflare/vite-plugin` treats AI bindings as inherently remote. To run the dev server without Cloudflare credentials, use the local config:

```bash
npx react-router dev --config vite.config.local.ts
```

This uses `wrangler.local.jsonc` (local D1/R2/KV via Miniflare, AI/Vectorize stubbed) with `BETTER_AUTH_URL=http://localhost:5173` so Dev Login works. AI-dependent features (scan, generate, plan-week, import-url) will not function in local mode.

### Dev Login

When `BETTER_AUTH_URL` contains `localhost`, a **Dev Login** button appears on the landing page. Credentials: `dev@ration.app` / `ration-dev`. No secrets or email provider needed.

### Local D1 migrations

Apply migrations to the local Miniflare D1 before first run:

```bash
bun run db:migrate:local
```

For the local config variant:

```bash
npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc
```

### Quality checks

Standard commands per `package.json`:

- `bun run lint` — Biome linter (warnings only, no errors expected)
- `bun run test:unit` — Vitest (39 files, 602 tests)
- `bun run typecheck` — cf-typegen + react-router typegen + tsc

### Key gotchas

- The `postinstall` script runs `wrangler types` (cf-typegen), which generates `worker-configuration.d.ts`. If this file is missing, TypeScript compilation will fail.
- AI and Vectorize bindings are always treated as remote by `@cloudflare/vite-plugin`. This is hardcoded in wrangler's `pickRemoteBindings()`. The `remoteBindings: false` flag in the local vite config is the workaround.
- Both `bun run dev` and `bun run dev:remote` set `CLOUDFLARE_ENV=dev`, which selects `wrangler.dev.jsonc` (all bindings remote). There is no built-in script for fully local dev — use the `vite.config.local.ts` approach above.
