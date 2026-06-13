# OAuth browser flow contract (Better Auth-native)

## Query parameters

| Param | Required | Description |
|-------|----------|-------------|
| `oauth_query` | Yes (except error pages) | Better Auth signed authorization payload (opaque URL-encoded query string with `sig` and `exp`) |

Better Auth may also redirect with the same fields **flat** in the URL (no nested `oauth_query`). Ration pages accept both via `getSignedOAuthQuery()`.

**Do not add** Ration-specific params (`flow_id`, `household_selected`, `post_login`) to the signed blob or alongside it on Ration-built links — they break signature verification.

## Authorization state

Better Auth owns the flow:

- Signed `oauth_query` (~600s TTL via `exp`)
- Signed `ba_pl` / postLogin-cleared marker on consent redirects (Better Auth internal)
- Session cookie (`activeOrganizationId` after household selection)
- Request-scoped `oAuthState` during `oauth2Continue` / `oauth2Consent` API calls
- Short-lived `ration_oauth_cid` correlation cookie for observability only (not authorization state)

Ration does **not** persist OAuth state in KV and does **not** maintain parallel org-selection cookies.

## Browser flow

```
/oauth2/authorize (Better Auth)
  → /oauth/sign-in?{signed}
  → browser GET /api/auth/oauth2/authorize?{signed}   (after session exists)
  → /oauth/select-org?oauth_query={signed}            (multi-household MCP)
  → oauth2Continue({ postLogin: true })
  → /oauth/consent?{re-signed by BA}                    (follow redirect verbatim)
  → oauth2Consent({ accept, oauth_query, scope })
  → client callback (e.g. cursor://…?code=…)
```

Unauthenticated visits to `/oauth/select-org` or `/oauth/consent` redirect back to `/oauth/sign-in` with the same signed `oauth_query` — never to the app home page.

## Better Auth API redirect shapes

Both `oauth2Continue` and `oauth2Consent` return:

```json
{ "redirect": true, "url": "https://..." }
```

Legacy/alternate:

```json
{ "redirect_uri": "https://..." }
```

Routes must use `getSafeAuthRedirectUrl()` and follow the URL **verbatim** — never hand-build `/oauth/consent`.

## MCP household rule

MCP flows with `mcp:*` scopes always show `/oauth/select-org` on the first authorize pass when the user belongs to more than one household, even if the hub session already has a default `activeOrganizationId`. After household pick, `oauth2Continue({ postLogin: true })` re-runs authorize with Better Auth's native post-login flag so consent can proceed without loops.

## Discovery

Authorization-server metadata is published at:

- `/.well-known/oauth-authorization-server`
- `/.well-known/oauth-authorization-server/api/auth`
- `/.well-known/openid-configuration` (OIDC-compatible alias)
- `/.well-known/openid-configuration/api/auth`

Issuer is always `https://<app-domain>/api/auth`.

## Observability

Structured logs:

- `event=oauth_flow` — fields `step` (`sign_in` | `select_org` | `consent`), `outcome`, `error_code`, `correlation_id`, `client_id_redacted`, `detail` (no tokens or `oauth_query`)
- `event=mcp_oauth_verify_failed` — RS token verification failures with normalized `error_code` only

Fixtures: `app/test/fixtures/oauth/better-auth-redirects.json`
