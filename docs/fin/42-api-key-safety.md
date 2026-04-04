# API key safety

## One-time display

When you create an API key in **Hub → Settings**, Ration shows the **full secret once**. Copy it immediately into a **password manager** or secret store. After you leave the screen, you cannot retrieve the same string again—only **revoke** and create a new key.

## How keys are stored

The service stores a **one-way hash** of the key, not the plaintext. Validation uses a **constant-time** comparison to reduce timing attacks.

## Minimum scope

Enable only the scopes you need:

- **`inventory`** — CSV cargo export/import
- **`galley`** — JSON recipe export/import
- **`supply`** — supply CSV export
- **`mcp`** — MCP assistant tools

## Rotation

If a key leaks (committed to git, pasted in chat, screenshot):

1. **Create** a new key with the same scopes.
2. Update integrations to use the new key.
3. **Delete** the old key in Settings.

## Never share in tickets

When contacting support, **redact** keys. Describe problems with **timestamps** and **org name**, not secrets.

## MCP header

Clients must send `Authorization: Bearer rtn_live_...` including the **`Bearer `** prefix—see *Connecting to MCP*.

If Settings UI changes, follow the **in-app** key management flow.
