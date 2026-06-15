# Agent Onboarding Contract (v1.3.6)

Machine-readable contract for Ration agent-first onboarding. Issuer invariant: all discovery surfaces MUST use `resolveAuthorizationServerIssuer(env)` from `app/lib/oauth.constants.ts` — never hardcode.

## Issuer

```
https://<app-domain>/api/auth
```

Byte-identical across: app PRM, `agent_auth.issuer`, MCP PRM `authorization_servers[0]`, JWT `iss`.

## Scope tiers

| Tier | API key scopes | Billing | Destructive MCP tools |
|------|----------------|---------|----------------------|
| Pre-claim (Tier 0) | `mcp:read` | No | No (read-only key) |
| Post-claim (Tier 1) | `mcp:read`, `mcp:inventory:write`, `mcp:galley:write`, `mcp:manifest:write`, `mcp:supply:write`, `mcp:preferences:write` | No | Yes (subject to scope checks) |
| OAuth (interactive) | User-selected `mcp:*` at consent | No (org role `credits:purchase` separate) | Per granted scope |

Constants: `PRE_CLAIM_API_SCOPES`, `POST_CLAIM_API_SCOPES` in `app/lib/agent/scopes.ts`.

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
  "scopes": ["mcp:read"],
  "docs": { "auth_md": "...", "connect": "..." }
}
```

## Tier 1 — User claim

1. `POST /api/agent/auth/claim` — `{ claim_token, email }` → OTP email (generic response always)
2. `POST /api/agent/auth/claim/complete` — `{ claim_token, email, otp }` → widen scopes / merge

**Rate limits:** `agent_auth_claim` (10/min per IP + per email), `agent_auth_claim_complete` (5 per 5min per claim token).

**Merge:** When email matches existing user, org-scoped data migrates to canonical personal org; stub user+org deleted; `maxOwnedGroups: 1` preserved for free tier.

## Discovery surfaces

| Surface | Path | Notes |
|---------|------|-------|
| auth.md | `/auth.md` | Markdown; H1 contains `auth.md`; Tier 0 + Tier 1 only |
| App PRM | `/.well-known/oauth-protected-resource` | `authorization_servers`, `bearer_methods_supported: ["header"]` |
| AS metadata | `/.well-known/oauth-authorization-server` | Merged `agent_auth` block (`skill`, `register_uri`, `claim_uri`, `identity_types_supported`, `anonymous.credential_types_supported`) |
| Connect | `/connect` | Deep links + manual MCP URL |
| DNS-AID | `_index._agents.ration.mayutic.com`, `_mcp._agents.ration.mayutic.com` | HTTPS (TYPE65) records in Cloudflare `mayutic.com` zone; DNSSEC + AWS registrar DS |

**Advertise-only:** No `identity_assertion` / `id-jag` until Tier 2 is implemented.

### Example `agent_auth` block (OAuth AS metadata)

Merged into `GET /.well-known/oauth-authorization-server`:

```json
{
  "skill": "https://ration.mayutic.com/auth.md",
  "register_uri": "https://ration.mayutic.com/api/agent/auth",
  "claim_uri": "https://ration.mayutic.com/api/agent/auth/claim",
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

## Extension seams (out of scope v1.3.0)

- **Tier 2 ID-JAG:** Add `identity_assertion` to `agent_auth.identity_types_supported` when backed.
- **Agent billing:** `credits:purchase` via separate plan; never on pre-claim keys.
- **Audit event feed:** `auditMcpWrite` is log-only; D1/Analytics persistence is a follow-up.
- **Limited pre-claim write:** `agent_registration.preClaim` flag + destructive-tool denylist in `makeTool`.

## GDPR

`agent_registration` rows deleted in `api/user/purge` by `userId` and owned `organizationId`.

## Regression tests

- Issuer byte-equality: `app/lib/__tests__/agent-onboarding.test.ts`
- Signup hook parity: `buildPersonalOrgRecords` in `app/lib/__tests__/agent-onboarding.test.ts`
- Zod schemas: `app/lib/schemas/__tests__/agent-auth.test.ts`
