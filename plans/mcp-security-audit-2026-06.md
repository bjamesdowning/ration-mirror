# MCP Security Audit — June 2026

**Date:** 2026-06-09 (initial) · **Remediation sign-off:** 2026-06-15  
**Scope:** MCP worker transport, OAuth AS, tool tenancy, dependencies/config  
**Auditors:** Parallel sub-agents A1–A4

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 0 | — |
| High | 7 | **Remediated** (Wave 3, v1.3.2+) |
| Medium (selected) | 5 | **Remediated** (v1.3.2–v1.3.4) |
| Low | 12 | Documented / backlog |
| Info | 6 | Positive controls (preserved) |

## High Findings — Remediation Status

| ID | Finding | Status | Fix |
|----|---------|--------|-----|
| H-T1 | No body size cap on transport | **Closed** | [`app/lib/mcp/transport.server.ts`](app/lib/mcp/transport.server.ts) — 4 MB cap even without `Content-Length` |
| H-T2 | Unbounded JSON-RPC batch | **Closed** | Max 10 requests per batch |
| H-T3 | Handler 500 leaks raw `error.message` | **Closed** | [`app/lib/mcp/worker-response.server.ts`](app/lib/mcp/worker-response.server.ts) |
| H-O1 | Refresh-token revoke ignores `referenceId` | **Closed** | [`app/lib/oauth.server.ts`](app/lib/oauth.server.ts) |
| H-O2 | Consent check skipped without `client_id` | **Closed** | `finalizeVerifiedToken` requires `client_id`/`azp` |
| H-TL1 | `get_expiring_items` unbounded | **Closed** | `getExpiringCargo` + `MAX_EXPIRING_ITEMS=200` |
| H-TL2 | `match_meals` full catalog | **Closed** | `MAX_MATCH_MEALS_LIMIT=50` + `preLimit` |

## Medium Findings — Remediation Status

| ID | Finding | Status | Fix |
|----|---------|--------|-----|
| M-T1 | Wildcard CORS on `/mcp` | **Accepted** | Public MCP endpoint; `WWW-Authenticate` uses config-derived resource URL |
| M-O3 | JWKS cache 1h after key removal | **Closed** | TTL reduced to 600s; rotation refetch unchanged |
| M-TL1 | `update_meal` injection guards | **Closed** | `McpUpdateMealSchema` shares `refineMcpMealTextFields` |
| M-TL2 | Audit logs full userId/orgId | **Closed** | `redactId` on all identifier fields in [`audit.ts`](app/lib/mcp/audit.ts) |
| M-C1 | Dev MCP Vectorize → prod index | **Closed** | `ration-cargo-dev` in [`wrangler.mcp.jsonc`](wrangler.mcp.jsonc) |

## Backlog (not remediated)

| ID | Finding | Notes |
|----|---------|-------|
| M-D1 | Delegation JWT replay (24h window) | JTI replay store deferred; see [docs/fin/40-security-overview.md](../docs/fin/40-security-overview.md) |
| M-D2 | Body read via `arrayBuffer` without `Content-Length` | Acceptable at MCP scale; streaming abort optional follow-up |

## Positive Controls (preserved)

- Per-request `McpServer` isolation ([`workers/mcp.ts`](workers/mcp.ts))
- Auth before handler; `env.__mcp` tenancy injection (legacy `__orgId` removed v1.3.3)
- OAuth RS: issuer, audience, JWKS, membership, consent, `client_id` required
- Tool tenancy: all queries scoped via `ctx.organizationId`
- Layered rate limits (HTTP IP via `CF-Connecting-IP`, org, per-credential mutation cap, delegated per-user)
- Destructive ops require `confirm:true`
- CSV/import limits (1 MB, 500 rows)
- Modular tool registration ([`app/lib/mcp/tool-runtime.ts`](app/lib/mcp/tool-runtime.ts), [`app/lib/mcp/tools/`](app/lib/mcp/tools/))

## Test Coverage (v1.3.4)

| Area | Test file |
|------|-----------|
| Worker fetch (401, 429, 413, 500 sanitize, CORS) | [`app/lib/mcp/__tests__/mcp-worker.test.ts`](app/lib/mcp/__tests__/mcp-worker.test.ts) |
| Transport limits | [`app/lib/mcp/__tests__/transport.server.test.ts`](app/lib/mcp/__tests__/transport.server.test.ts) |
| Scopes | [`app/lib/mcp/__tests__/scopes.test.ts`](app/lib/mcp/__tests__/scopes.test.ts) |
| Auth, OAuth RS, delegation, tools | Existing `app/lib/mcp/__tests__/*` |

## Sign-off

| Phase | Status |
|-------|--------|
| Audit complete | Done |
| High + selected medium remediation | **Done** (v1.3.4) |
| Fin delegation | Shipped |
| CI MCP deploy automation | Deferred (manual `bun run deploy:mcp`) |
