# MCP Security Audit — June 2026

**Date:** 2026-06-09  
**Scope:** MCP worker transport, OAuth AS, tool tenancy, dependencies/config  
**Auditors:** Parallel sub-agents A1–A4

## Summary

| Severity | Count | Action |
|----------|-------|--------|
| Critical | 0 | — |
| High | 7 | Fix before/with delegation ship |
| Medium | 18 | Schedule; fix high-impact items in remediation wave |
| Low | 12 | Document / backlog |
| Info | 6 | Positive controls |

## High Findings (remediate in Wave 3)

| ID | Area | Finding | Remediation |
|----|------|---------|-------------|
| H-T1 | Transport | No body size cap on WorkerTransport path | Pre-check Content-Length in workers/mcp.ts |
| H-T2 | Transport | Unbounded JSON-RPC batch arrays | Cap batch size before handler |
| H-T3 | Transport | Handler 500 responses leak raw error.message | Sanitize handler responses |
| H-O1 | OAuth | Refresh-token revoke ignores referenceId (multi-household) | Scope revoke to referenceId in oauth.server.ts |
| H-O2 | OAuth/RS | Consent check skipped when JWT lacks client_id | Require client_id/azp at RS |
| H-TL1 | Tools | get_expiring_items unbounded SELECT | Use getExpiringCargo with limit |
| H-TL2 | Tools | match_meals loads full catalog | Cap limit + preLimit |

## Medium Findings (selected for remediation)

| ID | Finding | Remediation |
|----|---------|-------------|
| M-T1 | Wildcard CORS on authenticated /mcp | Pin WWW-Authenticate to config URL |
| M-O3 | JWKS cache 1h after key removal | Lower TTL or invalidate on rotation |
| M-TL1 | update_meal lacks injection guards | Extend McpCreateMealSchema to updates |
| M-TL2 | Audit logs full userId/orgId | Use redactId in audit.ts |
| M-C1 | Dev MCP Vectorize points at prod index | Fix wrangler.mcp.jsonc env.dev |

## Positive Controls

- Per-request McpServer isolation (workers/mcp.ts)
- Auth before handler; env.__mcp tenancy injection
- OAuth RS: issuer, audience, JWKS, membership, consent (when client_id present)
- Tool tenancy: all queries scoped via ctx.organizationId
- Layered rate limits (HTTP, org, per-key)
- Destructive ops require confirm:true
- CSV/import limits (1MB, 500 rows)

## Sign-off

| Phase | Status |
|-------|--------|
| Audit complete | Done |
| Critical/High remediation | In progress (Wave 3) |
| Fin delegation | In progress (Wave 2) |
