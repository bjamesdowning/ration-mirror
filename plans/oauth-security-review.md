# OAuth flow security review (Better Auth-native)

**Date:** 2026-05-29  
**Scope:** MCP delegated OAuth browser pages + existing RS validation

## Checklist

| # | Area | Result | Notes |
|---|------|--------|-------|
| 1 | Token handling | **Pass** | No OAuth state in KV; tokens only issued by Better Auth at consent |
| 2 | PII in logs | **Pass** | `oauth_flow` logs use `redactId` for client_id; no `oauth_query`, email, or tokens |
| 3 | CSRF / session | **Pass** | OAuth routes use `requireAuth`; household via `setActiveOrganization` + session cookie |
| 4 | Signed query tampering | **Pass** | Better Auth `verifyOAuthQueryParams` on continue/consent; routes forward blob verbatim |
| 5 | Open redirect | **Pass** | `getSafeAuthRedirectUrl` allows https/http and `cursor:` only |
| 6 | Org binding | **Pass** | MCP flows require select-org; `referenceId` on consent; RS `hasActiveConsent` |
| 7 | DCR abuse | **Pass** | Existing `oauth_register` rate limits on `/api/auth` |
| 8 | RS JWT validation | **Pass** | issuer, audience, JWKS rotation refetch, membership + consent per request |
| 9 | GDPR revoke | **Pass** | `revokeConnectedAgentGrant` deletes consent + revokes refresh tokens |
| 10 | TTL / replay | **Pass** | Signed `oauth_query` ~600s; access token 10 min |

## Findings

| Severity | Finding | Mitigation |
|----------|---------|------------|
| Low | Stale `oauthConsent` rows with null `reference_id` from pre-C flows | UI warns "Not linked"; user must revoke and reconnect |
| Info | No automated mass-delete of incomplete consents | Documented support SQL in README; manual ops only |

## Sign-off

| Role | Status |
|------|--------|
| Implementation | Complete with unit tests |
| Production deploy | Pending operator smoke test |
