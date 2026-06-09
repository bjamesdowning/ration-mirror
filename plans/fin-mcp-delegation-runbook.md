# Fin MCP Delegation Runbook

Operational steps to connect Intercom Fin to the Ration MCP server with per-user delegated access.

## Prerequisites

- Intercom workspace with Fin enabled and Messenger Security (identity verification) enforced.
- Ration production deploy with delegation code shipped.
- Secrets set on **both** workers (`ration` and `ration-mcp`):

```bash
wrangler secret put FIN_MCP_DELEGATION_SECRET --config wrangler.jsonc
wrangler secret put FIN_MCP_DELEGATION_SECRET --config wrangler.mcp.jsonc
```

Use a dedicated 32+ character random secret (never reuse `INTERCOM_MESSENGER_JWT_SECRET` or `BETTER_AUTH_SECRET`).

## 1. Create the Fin service account

1. Sign up a dedicated account (e.g. `fin-service@yourdomain.com`).
2. Do **not** add real household data to its auto-created personal org.
3. This account completes the one-time MCP OAuth connect — its identity is never used for data access.

## 2. Connect Fin to Ration MCP (workspace-level OAuth)

1. In Intercom, add a **Custom MCP** connector pointing to `https://mcp.ration.mayutic.com/mcp`.
2. Sign in as the **Fin service account** (not a personal admin).
3. At `/oauth/select-org`, select the service account's **empty personal org**.
4. Grant scopes: `offline_access`, `mcp:delegate`, and the granular `mcp:*` scopes Fin needs (read + write as required).
5. Record the OAuth **client_id** from the DCR registration (Hub → Settings → Connected Agents, or `oauthClient` table).

## 3. Allowlist the Fin client

Set the client ID on the MCP worker:

```bash
wrangler secret put FIN_DELEGATION_CLIENT_IDS --config wrangler.mcp.jsonc
# Value: the Fin client_id (comma-separated if multiple trusted agents later)
```

Redeploy `ration-mcp` after setting the secret.

## 4. Configure Intercom user attribute

1. In Intercom → Settings → People Data, ensure a custom attribute exists for the signed delegation token (JWT key: `ration_mcp_delegation`).
2. Messenger Security must be **Enforced** so Intercom trusts the signed JWT from Ration's root loader.
3. Ration ships `ration_mcp_delegation` inside the signed `intercom_user_jwt` on every authenticated page load (24h TTL, re-signed on navigation).

## 5. Wire Fin data connectors

For each MCP tool Fin should call:

1. Enable the connector for Fin (direct trigger).
2. Map the Intercom user attribute `ration_mcp_delegation` into the tool parameter **`actor_token`**.
3. Fin's workspace OAuth token is sent automatically as the Bearer credential — do not override it.
4. For destructive tools, instruct Fin to collect explicit user confirmation before passing `confirm: true`.

## 6. Smoke test

1. Sign in to Ration as a test user with pantry data; open Hub (boots Intercom messenger).
2. In Intercom, verify the test contact has `ration_mcp_delegation` populated.
3. Ask Fin: "What is expiring in my pantry this week?"
4. Confirm Fin calls `get_expiring_items` with a valid `actor_token` and returns org-scoped results.
5. **Token refresh:** leave a conversation idle >10 minutes, then trigger another MCP tool call. Confirm Fin silently refreshes its OAuth access token (no user-visible auth error). If Fin fails on 401, investigate refresh-token rotation before extending access-token TTL.

## 7. Revocation

| Action | Effect |
|--------|--------|
| User revokes org membership | Next MCP call fails `delegation_membership_revoked` |
| User navigates away / session ends | New `ration_mcp_delegation` stops updating in Intercom |
| Revoke Fin OAuth grant (Connected Agents) | All Fin MCP calls fail at Bearer auth |
| Remove client from `FIN_DELEGATION_CLIENT_IDS` | Delegate path disabled even if grant exists |

## Security notes

- Fin's workspace token alone cannot access user data — `actor_token` is required.
- Delegation JWT audience is `ration-mcp-delegation` (not usable as an OAuth access token).
- Delegated calls are rate-limited per subject user (`mcp_delegated_read` 20/min, `mcp_delegated_write` 6/min).
- All delegated calls emit `mcp_audit` logs with redacted actor/subject IDs.
