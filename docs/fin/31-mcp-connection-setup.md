# Connecting to MCP

## API key format

Keys look like: `rtn_live_` followed by **32 hexadecimal characters**. Example shape: `rtn_live_` + `a1b2c3d4…` (do not share real keys).

## Authorization header

MCP requests must send:

```http
Authorization: Bearer rtn_live_<your-full-key>
```

Include the word **`Bearer`** and a **space** before the key. Clients that send only the key without `Bearer ` often fail with connection or auth errors.

## Host

Point your MCP client at **`mcp.ration.mayutic.com`** with the path your client expects (often `/mcp` for streamable HTTP).

## Common failures

| Symptom | Check |
|---------|--------|
| Connection closed / ServerError | `Authorization` is exactly `Bearer ` + full key |
| 401 / forbidden | Key has legacy **`mcp`** or any **`mcp:`** scope; key not revoked |
| Wrong pantry | Key is tied to a **different organization** than you expect |

## Advanced debugging

Some MCP bridges support a **`--debug`** flag; logs may be written under a user config directory (see your client’s docs). Use debug only temporarily and **redact** keys from logs you share.

## Cursor configuration

Add Ration to your `~/.cursor/mcp.json` (or your workspace's `mcp.json`):

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

Restart Cursor. The Ration tools (e.g. `list_inventory`, `add_cargo_item`, `match_meals`) appear in the agent's tool list.

## Claude Code / Claude Desktop configuration

Edit your Claude config (e.g. `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

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

Restart Claude Desktop. To verify, ask Claude: *"List my Ration pantry."*

## Discovery: what the agent sees

Successful MCP responses include an [RFC 8288 `Link` header](https://datatracker.ietf.org/doc/html/rfc8288) (relative to the **response origin**) with relations including:

- **`api-catalog`** → `/.well-known/api-catalog` (RFC 9727 linkset: REST + MCP anchors)
- **`service-doc`** → `/docs/api`
- **`service-desc`** → `/api/openapi.json` (OpenAPI for REST v1)
- **`mcp-server-card`** → `/.well-known/mcp/server-card.json` (MCP transport + tool groups)
- **`agent-skills`** → `/.well-known/agent-skills/index.json`

Use these to discover scopes and capabilities before or alongside calling tools. The MCP worker also registers **resources** and **prompts** (see below) for canonical shapes and workflows.

You can also fetch first-party MCP **resources** for canonical reference data:

- `ration://resources/units` — supported quantity units and aliases.
- `ration://resources/domains` — `food` / `consumable` / `medication` taxonomy.
- `ration://resources/inventory_import_schema` — exact shape `apply_inventory_import` accepts.
- `ration://resources/capabilities` — full tool/scope manifest.
- `ration://resources/connection_guide` — minimal client reconnection guide.

And **prompts** for repeatable workflows:

- `parse_receipt` — instructs the agent to convert a receipt image/text into the inventory-import schema.
- `plan_week` — guides weekly meal planning against current pantry and preferences.

## Rotation

Create a **new** key, update the client, then **delete** the old key in Settings.

If behavior differs from a new Ration release, check *MCP tools reference* for updates.
