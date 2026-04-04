# MCP overview

## What MCP is

**Model Context Protocol (MCP)** lets desktop AI tools (for example **Cursor**, **Claude Desktop**) call Ration on your behalf: list pantry items, update supply, plan meals, and more. Ration exposes a dedicated MCP endpoint on a separate Cloudflare Worker that shares the same database and search stack as the web app.

## Host and authentication

- **Host:** `mcp.ration.mayutic.com` (production).
- **Auth:** HTTP **Bearer** token using a Ration **API key** whose scope includes **`mcp`**.
- **Data scope:** All tools operate on **one organization**—the org bound to that API key.

## Creating a key

In **Hub → Settings**, create an API key and enable the **MCP** scope (along with any other scopes you need). The raw key is shown **once**—store it in a password manager.

## Security expectation

Treat MCP keys like passwords. Anyone with the key can read and mutate org data allowed by MCP tools—revoke keys you no longer use.

## Next steps

- *Connecting to MCP* — header format and client config.
- *MCP tools reference* — full tool list and rate limits.
- *MCP vs web app* — what MCP cannot do.
