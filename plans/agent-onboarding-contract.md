# Agent Onboarding Contract (v1.3.8)

Machine-readable contract for Ration agent-first onboarding. Issuer invariant: all discovery surfaces MUST use `resolveAuthorizationServerIssuer(env)` from `app/lib/oauth.constants.ts` — never hardcode.

## Issuer

```
https://<app-domain>/api/auth
```

Byte-identical across: app PRM, `agent_auth.issuer`, MCP PRM `authorization_servers[0]`, JWT `iss`.

## Scope tiers

| Tier | API key scopes | Billing | Tier capacity |
|------|----------------|---------|---------------|
| Pre-claim (Tier 0) | Full `AGENT_API_KEY_SCOPES` (read + all MCP writes) | No | Free tier limits |
| Post-claim (Tier 1) | Same `AGENT_API_KEY_SCOPES` (unchanged) | No | Free tier limits (upgrade via Crew Member) |
| OAuth (interactive) | User-selected `mcp:*` at consent | No (org role `credits:purchase` separate) | Per household tier |

Constant: `AGENT_API_KEY_SCOPES` in `app/lib/agent/scopes.ts`.

**Claim delta:** Ownership verification + email identity + optional merge — **not** scope widening (`preClaim: false` only).

## Time limits & retention

| Policy | Constant / endpoint | Duration | Applies to |
|--------|---------------------|----------|------------|
| Initial claim token validity | `CLAIM_TOKEN_SLIDE_MS` | 180 days from registration | `pending_claim` only |
| Claim token slide (Option B) | `slideClaimTokenExpiry` | Resets to 180 days from last auth | `pending_claim` only |
| Claim reissue (Option A) | `POST /api/agent/auth/claim/reissue` | Bearer agent API key; 3/hour per key | `pending_claim` only |
| Claim OTP validity | `CLAIM_OTP_TTL_SEC` | 10 minutes | Per OTP send |
| Claim OTP max attempts | `CLAIM_OTP_MAX_ATTEMPTS` | 5 per OTP | Per registration |
| Orphan kitchen deletion | `AGENT_ORPHAN_INACTIVITY_MS` | 180 days idle (last auth or `createdAt`) | `pending_claim` only |
| Pre-claim MCP write rate limit | `mcp_write_preclaim` + `mcp_write_preclaim_per_key` | 10/min org + key | `preClaim: true` |
| Agent registration rate limit | `agent_auth_register` | 5/min per IP | Registration |

Claimed kitchens are never purged by the orphan job.

## Tier 0 — Anonymous registration

```
POST /api/agent/auth
Content-Type: application/json

{ "type": "anonymous", "client_hint": "optional" }
```

**Rate limit:** `agent_auth_register` — 5/min per IP.

**D1 writes (single `db.batch()`):** user (~13 params), organization (6), member (5), api_key (8), agent_registration (~10). Each statement < 100 bound params.

**Response (secrets returned once):**

```json
{
  "api_key": "rtn_live_...",
  "claim_token": "...",
  "claim_url": "https://<app>/connect/claim?token=...",
  "organization_id": "uuid",
  "mcp_endpoint": "https://mcp.ration.mayutic.com/mcp",
  "scopes": ["mcp:read", "mcp:inventory:write", "mcp:galley:write", "mcp:manifest:write", "mcp:supply:write", "mcp:preferences:write"],
  "docs": { "auth_md": "...", "connect": "..." }
}
```

`claimTokenExpiresAt` is set to `now + CLAIM_TOKEN_SLIDE_MS` (180 days).

## Tier 1 — User claim

1. `POST /api/agent/auth/claim` — `{ claim_token, email }` → OTP email (generic response always)
2. `POST /api/agent/auth/claim/complete` — `{ claim_token, email, otp, tos_accepted: true, tos_version }` → ownership transfer / merge

**Rate limits:** `agent_auth_claim` (10/min per IP + per email), `agent_auth_claim_complete` (5 per 5min per claim token).

**Merge:** When email matches existing user, org-scoped data migrates to canonical personal org; stub user+org deleted; `maxOwnedGroups: 1` preserved for free tier. ToS: `max(tosAcceptedAt)` wins on merge.

## Claim recovery

- **Option B (passive):** API/MCP auth slides `claimTokenExpiresAt` while `pending_claim`.
- **Option A (active):** `POST /api/agent/auth/claim/reissue` with Bearer agent API key → new `claim_token` + `claim_url`.

If both API key and claim URL are lost, recovery requires support.

## Discovery surfaces

| Surface | Path | Notes |
|---------|------|-------|
| auth.md | `/auth.md` | Markdown; H1 contains `auth.md`; retention table + recovery |
| App PRM | `/.well-known/oauth-protected-resource` | `authorization_servers`, `bearer_methods_supported: ["header"]` |
| AS metadata | `/.well-known/oauth-authorization-server` | Merged `agent_auth` block |
| Connect | `/connect` | Deep links + manual MCP URL |
| Claim UI | `/connect/claim` | OTP claim + ToS + API key reissue recovery |

**Advertise-only:** No `identity_assertion` / `id-jag` until Tier 2 is implemented.

### Example `agent_auth` block (OAuth AS metadata)

Merged into `GET /.well-known/oauth-authorization-server`:

```json
{
  "skill": "https://ration.mayutic.com/auth.md",
  "register_uri": "https://ration.mayutic.com/api/agent/auth",
  "claim_uri": "https://ration.mayutic.com/api/agent/auth/claim",
  "reissue_uri": "https://ration.mayutic.com/api/agent/auth/claim/reissue",
  "identity_types_supported": ["anonymous"],
  "anonymous": {
    "credential_types_supported": ["api_key"]
  },
  "issuer": "https://ration.mayutic.com/api/auth",
  "protected_resource_metadata": "https://ration.mayutic.com/.well-known/oauth-protected-resource",
  "mcp_resource": "https://mcp.ration.mayutic.com/mcp"
}
```

### DNS-AID (infrastructure)

Not served by Workers — configured in **Cloudflare DNS** for `mayutic.com`:

| Record name | Target | HTTPS value |
|-------------|--------|-------------|
| `_index._agents.ration` | `ration.mayutic.com` | `alpn="h2,http/1.1" port=443 mandatory=alpn,port` |
| `_mcp._agents.ration` | `mcp.ration.mayutic.com` | `alpn="h2,http/1.1" port=443 mandatory=alpn,port` |

Priority `1` on both. DNSSEC: enabled in Cloudflare; DS record at AWS (registrar). Validate: `dig -t TYPE65 _mcp._agents.ration.mayutic.com @1.1.1.1 +dnssec`.

## Extension seams (out of scope)

- **Tier 2 ID-JAG:** Add `identity_assertion` to `agent_auth.identity_types_supported` when backed.
- **Agent billing:** `credits:purchase` via separate plan; never on agent registration keys.
- **Audit event feed:** `auditMcpWrite` is log-only; D1/Analytics persistence is a follow-up.

## GDPR

`agent_registration` rows deleted in `api/user/purge` by `userId` and owned `organizationId`. Orphan purge deletes unclaimed idle kitchens after 180 days.

## Regression tests

- Issuer byte-equality: `app/lib/__tests__/agent-onboarding.test.ts`
- Signup hook parity: `buildPersonalOrgRecords` in `app/lib/__tests__/agent-onboarding.test.ts`
- Zod schemas: `app/lib/schemas/__tests__/agent-auth.test.ts`
- Claim slide / reissue / orphan: `app/lib/__tests__/claim-*.test.ts`, `orphan-cleanup.server.test.ts`
