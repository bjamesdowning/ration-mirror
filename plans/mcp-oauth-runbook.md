# MCP OAuth Operations Runbook

## JWKS key rotation

1. Deploy new Better Auth JWT keys via the `jwt` plugin (automatic on rotation trigger).
2. Call `invalidateJwksCache` on MCP worker KV (`oauth:jwks` key) or wait for TTL (10 minutes).
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
- Open DCR allows the supported granular `mcp:*` scopes; delegated actor-token scopes are no longer part of the provider vocabulary.
- Public `scopes_supported` in AS metadata (`advertisedMetadata.scopes_supported`) and MCP PRM (`OAUTH_ADVERTISED_MCP_SCOPES`) must stay aligned with `clientRegistrationAllowedScopes`.

## Consent loop / redirect_missing

- Requires `@better-auth/oauth-provider` >= 1.6.10 (Ration pins 1.6.16+) so consent-accept honors the `ba_pl` postLogin marker.
- Sign-in resume must use a **browser navigation** to `/api/auth/oauth2/authorize?{signed}` — do not replay authorize via internal `auth.handler()` sub-requests.
- If users still loop: revoke grant, remove MCP server in client, reconnect in a fresh tab within ~10 minutes.
- Check Worker logs for `event=oauth_flow` with `error_code=redirect_missing` at `step=select_org` or `step=consent`, or `event=mcp_oauth_verify_failed` on the MCP worker.

## Select-org stall (picks org, nothing happens)

- Symptom: sign-in works, user picks a household on `/oauth/select-org`, requests succeed (`step=select_org outcome=success`) but the page never advances to consent.
- Cause: `shouldOAuthPostLoginRedirect` returning `true` after household pick because Better Auth does not set `ba_pl` on the select-org redirect. Multi-household users need the short-lived `ration_oauth_org_selected` cookie merged into internal `oauth2Continue` so `shouldRedirect` returns `false`.
- Fix: `/oauth/select-org` sets `ration_oauth_org_selected`, merges it into continue headers, and rejects continue responses that still target `/oauth/select-org` (`error_code=flow_step_mismatch`). Fresh `GET /oauth2/authorize` strips the cookie.
- Confirm via logs: `event=oauth_flow step=select_org outcome=success detail=redirect_target=consent`. If `redirect_target=select_org` or `error_code=flow_step_mismatch`, the loop is still present.

## Silent consent failure / form-action block

- Symptom: Clicking **Authorize** on `/oauth/consent` does nothing; browser console shows `form-action 'self'` violation naming the consent URL (first hop in the redirect chain).
- Cause: Chrome/Safari block form-POST redirect chains to `http://localhost:PORT/callback` (mcp-remote) when CSP `form-action` is `'self'` only. Native schemes (`cursor://`, `warp://`) already route via `/oauth/return`.
- Fix: Consent success redirects localhost HTTP callbacks through `/oauth/return` (JS navigation bypasses `form-action`). Deploy >= v1.5.14. Do not relax global CSP to allow localhost.
- Confirm: After Authorize, browser briefly shows `/oauth/return` then lands on the MCP client callback with `?code=`.

## Never log

- Access tokens, refresh tokens, client secrets, or magic link URLs.
