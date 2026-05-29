# API key safety

## When to use API keys vs OAuth

- **MCP (recommended):** Use **OAuth** — paste `https://mcp.ration.mayutic.com/mcp` into your MCP client and authorize in the browser. Revoke grants in **Hub → Settings → Connected Agents**.
- **REST v1:** Organization API keys with **`inventory`**, **`galley`**, or **`supply`** scopes.
- **Advanced MCP:** API keys with **`mcp:*`** scopes when OAuth is unavailable (CI, custom headers, `mcp-remote` bridges).

OAuth grants and API keys are managed separately — revoking one does not affect the other.

## One-time display

When you create an API key in **Hub → Settings**, Ration shows the **full secret once**. Copy it immediately into a **password manager** or secret store. After you leave the screen, you cannot retrieve the same string again—only **revoke** and create a new key.

## How keys are stored

The service stores a **one-way hash** of the key, not the plaintext. Validation uses a **constant-time** comparison to reduce timing attacks.

## Minimum scope

Enable only the scopes you need:

- **`inventory`** — CSV cargo export/import (REST)
- **`galley`** — JSON recipe export/import (REST)
- **`supply`** — supply CSV export (REST)
- **`mcp`** — all MCP tools on the MCP worker (legacy “full MCP” key; advanced manual auth only)
- **`mcp:read`** — MCP read-only tools
- **`mcp:inventory:write`** — MCP pantry + structured import apply
- **`mcp:galley:write`** — MCP recipes + meal selection + cook
- **`mcp:manifest:write`** — MCP meal plan mutations
- **`mcp:supply:write`** — MCP shopping list mutations
- **`mcp:preferences:write`** — MCP user preference patches

For assistants, prefer **OAuth** or **least-privilege keys**: e.g. a read-only agent only needs `mcp:read`. See *MCP overview* for which tools each scope unlocks.

## Rotation

If a key leaks (committed to git, pasted in chat, screenshot):

1. **Create** a new key with the same scopes.
2. Update integrations to use the new key.
3. **Delete** the old key in Settings.

For OAuth grants, revoke in **Connected Agents** and reconnect.

## Never share in tickets

When contacting support, **redact** keys. Describe problems with **timestamps** and **org name**, not secrets.

## MCP header (advanced)

Manual MCP clients must send `Authorization: Bearer rtn_live_...` including the **`Bearer `** prefix—see *Connecting to MCP*.

If Settings UI changes, follow the **in-app** key management flow.
