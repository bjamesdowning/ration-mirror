# OAuth browser flow contract (Option C)

## Query parameters

| Param | Required | Description |
|-------|----------|-------------|
| `oauth_query` | Yes (except error pages) | Better Auth signed authorization payload (URL-encoded query string) |
| `flow_id` | Yes after flow creation | Opaque orchestrator id (`oauth:flow:{uuid}` in KV) |
| `client_id` | Optional | Display; also inside `oauth_query` |
| `scope` | Optional | Display; also inside `oauth_query` |
| `post_login` | Optional | Better Auth post-login marker |

## KV record

- **Key:** `oauth:flow:{flowId}`
- **TTL:** 600 seconds (`OAUTH_FLOW_TTL_SEC`)
- **Fields:** See `OAuthFlowRecord` in `app/lib/schemas/oauth-flow.ts`
- **Never stored in KV:** bearer tokens, refresh tokens, raw `oauth_query` (only SHA-256 digest)

## State machine

```
initiated → authenticated → org_selected → consent_presented → completed
                                                          ↘ failed
                                                          ↘ expired (KV miss / TTL)
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

Routes must use `getAuthRedirectUrl()` only — never hand-build `/oauth/consent`.

## MCP household rule

All requests including `mcp:*` scopes **must** pass through `/oauth/select-org` before consent, regardless of `session.activeOrganizationId`.

Fixtures: `app/test/fixtures/oauth/better-auth-redirects.json`
