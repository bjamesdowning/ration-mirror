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
| 401 / forbidden | Key has **`mcp` scope**; key not revoked |
| Wrong pantry | Key is tied to a **different organization** than you expect |

## Advanced debugging

Some MCP bridges support a **`--debug`** flag; logs may be written under a user config directory (see your client’s docs). Use debug only temporarily and **redact** keys from logs you share.

## Rotation

Create a **new** key, update the client, then **delete** the old key in Settings.

If behavior differs from a new Ration release, check *MCP tools reference* for updates.
