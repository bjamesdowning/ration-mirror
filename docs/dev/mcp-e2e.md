# MCP e2e suite

End-to-end tests for the Ration MCP server. They send real JSON-RPC (`initialize`, `tools/list`, `tools/call`) to the `ration-mcp` worker running locally in Miniflare, and check what an agent actually receives.

Unit tests under `app/lib/mcp/__tests__/` cover handlers with mocks. This suite covers what mocks cannot: the bundled worker, auth, the transport, the D1 schema from `drizzle/`, and the agent reply projection, all together.

## Run it

```bash
bun run test:mcp-e2e
```

No secrets, no network, and no remote bindings. In CI it runs as the `mcp-e2e` job on merge request pipelines, in parallel with the other test jobs, and publishes `reports/mcp-e2e-junit.xml`.

## How it works

`e2e/mcp/global-setup.ts` runs once:

1. Bundles the worker with `wrangler deploy --config wrangler.mcp.jsonc --env= --dry-run --outdir <tmp>`. This is the bundle Workers Builds ships. Nothing is uploaded.
2. Starts Miniflare on `127.0.0.1` with in-memory bindings only: D1 (`DB`, `NUTRITION_DB`), KV (`RATION_KV`), and R2 (`STORAGE`). There is no AI, Vectorize, Flagship, or analytics binding, so tools that need them are not covered here.
3. Applies every `drizzle/*.sql` migration to the local D1.
4. Seeds one test kitchen (`e2e/mcp/seed.ts`) and mints an API key for it.
5. Passes the URL, key, and seed ids to the tests with Vitest `provide`/`inject`.

Worker vars: `RATION_ENV=development`, `MCP_OAUTH_ENABLED=false` (API key auth only), and a local-only `BETTER_AUTH_SECRET` placeholder. `FEATURE_FLAG_OVERRIDES` turns on only the flags the suite needs (`E2E_FLAG_OVERRIDES` in `global-setup.ts`). Everything else keeps its registry default.

## Files

| File | Purpose |
|------|---------|
| `vitest.mcp-e2e.config.ts` | Vitest config for this suite only. Not part of `test:unit`. |
| `e2e/mcp/global-setup.ts` | Bundle, Miniflare, migrations, seed, teardown. |
| `e2e/mcp/seed.ts` | The test kitchen: user, kitchen, API key, consents, tags, Cargo, two meals with a nutrition snapshot, and a cooked Manifest entry. Fixed ids in `SEED_IDS`. |
| `e2e/mcp/harness.ts` | `McpTestClient` (JSON and SSE replies, session header) and the shared checks: `findDeniedKeys`, `findBadTimestamps`, `envelopeOf`. |
| `e2e/mcp/tool-cases.ts` | One entry per `tools/call`. |
| `e2e/mcp/mcp-tools.mcp-e2e.ts` | Transport tests (401s, `initialize`, `tools/list`) and the runner for `TOOL_CASES`. |

## What every tool case checks

- The envelope is `ok: true` and the result is not `isError`.
- The text copy and `structuredContent` agree.
- No internal id key at any depth (kitchen, user, consent, credential, key ids). The deny-list in `harness.ts` is kept separate from `app/lib/mcp/response-profile.ts` on purpose, so a change to one does not silently pass the other.
- Every key ending in `At` is `null`, an ISO 8601 date-time, or a `YYYY-MM-DD` date. A `Date` that turned into `{}` fails here.
- The reply fits its `maxBytes` budget. The run prints a size table at the end; use it when you set or tighten a budget.

## Add a tool case

1. If the tool needs data the seed does not have, add it to `seedMcpKitchen` with a fixed id in `SEED_IDS`. Keep the insert order valid for foreign keys.
2. If the tool is behind a flag, add the flag to `E2E_FLAG_OVERRIDES`.
3. Append a case to `TOOL_CASES`:

   ```ts
   {
   	id: "get_cargo_item:milk",
   	tool: "get_cargo_item",
   	args: (ctx) => ({ id: ctx.ids.cargoMilkId }),
   	maxBytes: 4_000,
   	check: (data) => {
   		expect(data).toMatchObject({ name: "Whole milk" });
   	},
   },
   ```

   Case ids must be unique. A later case can read an earlier case's data with `ctx.data(caseId)`, or its size with `ctx.bytes(caseId)`.
4. Run `bun run test:mcp-e2e` and set `maxBytes` from the size table with some headroom.

Cases run in order against one kitchen, so a write changes what later cases see. Put a write after the reads that depend on the old state, or use its own seeded rows.

## Limits

- **Rate limits.** The worker's KV rate limits apply (per minute: about 30 list calls, 15 writes per kitchen and per key, and 120 requests per IP). One run stays well under them. If the suite grows past that, split cases across files with their own seeded key, or wait between groups.
- **No AI or Vectorize.** Semantic search, AI recipe tools, and vector merges are not covered. Tools that only queue vector work still pass.
- **No OAuth.** OAuth is off, so only API key auth is exercised.
