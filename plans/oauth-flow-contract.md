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
- Session cookie (`activeOrganizationId` after household selection)
- Request-scoped `oAuthState` during `oauth2Continue` / `oauth2Consent` API calls

Ration does **not** persist OAuth state in KV.

## Browser flow

```
/oauth2/authorize (Better Auth)
  → /oauth/sign-in?{signed}
  → /oauth/select-org?oauth_query={signed}   (MCP scopes only)
  → oauth2Continue({ postLogin: true })
  → /oauth/consent?{re-signed by BA}         (follow redirect verbatim)
  → oauth2Consent({ accept, oauth_query, scope })
  → client callback (e.g. cursor://…?code=…)
```

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

MCP flows **must** pass through `/oauth/select-org`, then `oauth2Continue({ postLogin: true })`, before consent. `postLogin.shouldRedirect` is always true for `mcp:*` scopes; `oauth2Continue` runs authorize with `postLogin` set so it does not re-trigger select-org.

## Observability

Structured logs: `event=oauth_flow`, fields `step` (`sign_in` | `select_org` | `consent`), `outcome`, `error_code`, `client_id_redacted`, `detail` (no tokens or `oauth_query`).

Fixtures: `app/test/fixtures/oauth/better-auth-redirects.json`
