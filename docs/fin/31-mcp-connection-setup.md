# Connecting to MCP

## Recommended: OAuth 2.1 (standard clients)

Ration is AI-agent-ready out of the box. No API key required for Cursor, Claude Desktop, ChatGPT desktop, or other clients that support OAuth discovery.

### Steps

1. In your MCP client, add server URL **`https://mcp.ration.mayutic.com/mcp`**.
2. When prompted, sign in to Ration in your browser.
3. Select the **household** (organization) this agent may access.
4. Review and **approve** the requested permissions (granular `mcp:*` scopes).
5. Manage or revoke the grant anytime in **Hub → Settings → Connected Agents**.

### Cursor

Open MCP settings → add a **remote** server → paste `https://mcp.ration.mayutic.com/mcp`. Your browser opens for OAuth automatically. After authorization, Ration tools (e.g. `list_inventory`, `match_meals`) appear in the agent tool list.

### Claude Desktop / Claude Code

Add the same MCP URL in your Claude MCP configuration. On first connect, complete browser sign-in and consent. To verify, ask: *"List my Ration pantry."*

### Common OAuth failures

| Symptom | Check |
|---------|--------|
| Browser opens but consent fails | Authorization window ~10 minutes — revoke grant, remove MCP server in client, re-add URL, complete **sign-in → household → authorize** in one tab |
| Agent listed in Settings but tools fail | Incomplete grant (household not linked) — revoke and reconnect; you must pass **Select household** before consent |
| Wrong pantry data | Revoke and reconnect; pick the correct household at selection |
| Client reconnect loop | Client must support OAuth 2.1 / protected-resource discovery; restart connection from client (not an old browser tab) |

Support can correlate OAuth failures via Worker logs: `event=oauth_flow`, fields `step`, `outcome`, `error_code` (no tokens or signed query payloads).

---

## Advanced: API key auth (manual setup)

Use organization API keys when OAuth is unavailable (CI pipelines, custom headers, legacy bridges).

### API key format

Keys look like: `rtn_live_` followed by **32 hexadecimal characters**. Example shape: `rtn_live_` + `a1b2c3d4…` (do not share real keys).

Create keys in **Hub → Settings → API Keys** with one or more **`mcp:*`** scopes (or legacy **`mcp`**).

### Authorization header

```http
Authorization: Bearer rtn_live_<your-full-key>
```

Include the word **`Bearer`** and a **space** before the key.

### Cursor (API key)

```json
{
  "mcpServers": {
    "ration": {
      "url": "https://mcp.ration.mayutic.com/mcp",
      "headers": {
        "Authorization": "Bearer rtn_live_<your-key>"
      }
    }
  }
}
```

### mcp-remote bridge

```json
{
  "mcpServers": {
    "ration": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.ration.mayutic.com/mcp",
        "--header",
        "Authorization:${RATION_AUTH_HEADER}"
      ],
      "env": {
        "RATION_AUTH_HEADER": "Bearer rtn_live_<your-key>"
      }
    }
  }
}
```

### Common API key failures

| Symptom | Check |
|---------|--------|
| Connection closed / ServerError | `Authorization` is exactly `Bearer ` + full key |
| 401 / forbidden | Key has **`mcp`** or **`mcp:*`** scope; key not revoked |
| Wrong pantry | Key is tied to a **different organization** than you expect |

---

## Discovery: what the agent sees

Successful MCP responses include an [RFC 8288 `Link` header](https://datatracker.ietf.org/doc/html/rfc8288) with relations including:

- **`api-catalog`** → `/.well-known/api-catalog`
- **`service-doc`** → `/docs/api`
- **`mcp-server-card`** → `/.well-known/mcp/server-card.json` (transport auth: `oauth2`)
- **`agent-skills`** → `/.well-known/agent-skills/index.json`

OAuth metadata:

- **`/.well-known/oauth-authorization-server`** — authorization server (app domain)
- **`/.well-known/oauth-protected-resource`** — MCP resource metadata (MCP host)

MCP **resources**:

- `ration://resources/units`, `domains`, `inventory_import_schema`, `capabilities`
- `ration://guides/connect` — connection guide (OAuth-first)

MCP **prompts**: `parse_receipt`, `plan_week`

## Rotation

**OAuth:** Revoke the grant in Connected Agents and reconnect.

**API keys:** Create a new key, update the client, delete the old key in Settings.
