# MCP OAuth Operations Runbook

## JWKS key rotation

1. Deploy new Better Auth JWT keys via the `jwt` plugin (automatic on rotation trigger).
2. Call `invalidateJwksCache` on MCP worker KV (`oauth:jwks` key) or wait for TTL (1 hour).
3. Verify MCP accepts tokens signed with new keys.

## Compromised OAuth client

1. Disable client in `oauthClient.disabled` or delete the row.
2. Revoke refresh tokens for `client_id` in `oauthRefreshToken`.
3. Delete related `oauthConsent` rows.

## Emergency grant revocation sweep

1. User self-service: Hub → Settings → Connected Agents → Revoke.
2. Admin: delete `oauthConsent` + revoke `oauthRefreshToken` for `user_id`.

## DCR abuse

- Rate limit: `oauth_register` (10/min per IP).
- Monitor logs for `oauth_grant_revoked` and failed token validation spikes.
- Open DCR allows granular `mcp:*` scopes **except** `mcp:delegate` (Fin service agent only). Provision Fin clients out-of-band with the full `OAUTH_PROVIDER_SCOPES` vocabulary.

## Consent loop / redirect_missing

- Requires `@better-auth/oauth-provider` >= 1.6.10 (Ration pins 1.6.16+) so consent-accept honors the `ba_pl` postLogin marker.
- If users still loop: revoke grant, remove MCP server in client, reconnect in a fresh tab within ~10 minutes.
- Check Worker logs for `event=oauth_flow` with `error_code=redirect_missing` at `step=select_org` or `step=consent`.

## Never log

- Access tokens, refresh tokens, client secrets, or magic link URLs.
