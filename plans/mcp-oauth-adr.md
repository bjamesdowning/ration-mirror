# ADR: MCP-Only Delegated OAuth

## Status

Accepted — 2026-05-28; amended 2026-05-29 (Better Auth-native browser flow)

## Context

Ration exposes an MCP server for AI agents. Current auth is API-key only. MCP spec (2025-06-18) requires OAuth 2.1 resource-server metadata and delegated user consent for paste-URL connector UX.

## Decision

- **Authorization Server (AS):** main app worker (`ration.mayutic.com`), Better Auth `@better-auth/oauth-provider` + `jwt` plugins.
- **Resource Server (RS):** `ration-mcp` worker (`mcp.ration.mayutic.com`). Validates JWT access tokens via JWKS (cached in `RATION_KV`); does not issue tokens.
- **Audience (RFC 8707):** `https://mcp.ration.mayutic.com/mcp` (dev: derived from request origin).
- **Org binding:** single org per grant via `/oauth/select-org` + `setActiveOrganization` + `oauth2Continue`; `referenceId` on consent; `org` claim in access token; RS re-validates `member` on every request.
- **Browser flow:** Better Auth drives login → post-login (select household) → consent → code. Ration pages forward the signed `oauth_query` verbatim (see [oauth-flow-contract.md](./oauth-flow-contract.md)).
- **Scopes:** granular `mcp:*` only (no legacy `mcp` via OAuth).
- **DCR:** enabled with unauthenticated public-client registration; PKCE S256 mandatory; rate-limited.
- **Token TTL:** access 10 minutes; refresh 30 days with rotation.
- **Dual mode:** API keys remain supported for MCP until deprecation flag.

## Threat model checklist

- Token replay → short TTL + audience binding + org membership re-check
- Confused deputy → RFC 8707 resource/aud validation on RS
- Redirect URI abuse → exact match, HTTPS-only (localhost dev exception)
- DCR spam → rate limits + registration caps
- Key compromise → JWKS rotation runbook; grant revocation UI
- Cross-tenant access → org claim + member table validation per request
- Token passthrough → forbidden; RS never forwards bearer tokens upstream
- PII in logs → no tokens/secrets in telemetry

## Consequences

- New OAuth tables in D1; consent and org-selection UX; legal/policy updates.
- REST API remains API-key/session auth (unchanged).
