# MCP overview

## What MCP is

**Model Context Protocol (MCP)** lets desktop AI tools (for example **Cursor**, **Claude Desktop**, **ChatGPT desktop**) call Ration on your behalf: list pantry items, update supply, plan meals, and more. Ration exposes a dedicated MCP endpoint on a separate Cloudflare Worker that shares the same database and search stack as the web app.

## Host and authentication

- **Endpoint:** `https://mcp.ration.mayutic.com/mcp` (production).
- **Recommended auth:** **OAuth 2.1** delegated access — paste the MCP URL into your client, complete browser sign-in, **always select your household**, then approve scoped permissions. Better Auth holds flow state in the signed authorization query (~10 minute TTL); see [plans/oauth-flow-contract.md](../../plans/oauth-flow-contract.md). Manage or revoke grants in **Hub → Settings → Connected Agents**.
- **Advanced auth:** Organization **API keys** with **`mcp:*`** scopes (manual Bearer header for CI, legacy clients, or `mcp-remote` bridges).
- **Data scope:** OAuth grants and API keys operate on **one organization** — the household you select at consent (OAuth) or the org bound to the key (API key).

## Connecting (OAuth — recommended)

1. In your MCP client, add server URL `https://mcp.ration.mayutic.com/mcp`.
2. Complete browser sign-in, pick your household, and approve permissions.
3. Manage or revoke access anytime in **Hub → Settings → Connected Agents**.

Supported clients include Cursor, Claude Desktop, ChatGPT desktop, Zed, and any MCP client with OAuth 2.1 discovery.

## Scopes (least privilege)

OAuth consent and API keys can use granular **`mcp:*`** scopes:

- **`mcp:read`** — list/search inventory, meals, plan, expiring items, user preferences (no mutation).
- **`mcp:inventory:write`** — `add_cargo_item`, `update_cargo_item`, `adjust_cargo_item`, `remove_cargo_item`, `apply_inventory_import`, `import_inventory_csv`.
- **`mcp:galley:write`** — `create_meal`, `update_meal`, `delete_meal`, `consume_meal`, `toggle_meal_active`, `clear_active_meals`.
- **`mcp:manifest:write`** — meal-plan entry CRUD and bulk add.
- **`mcp:supply:write`** — supply list item CRUD, mark purchased, sync from selected meals, `complete_supply_list`.
- **`mcp:preferences:write`** — `update_user_preferences` (allergens, expiration alert days, theme).

Pick the smallest set that covers the agent's job. A read-only research agent only needs `mcp:read`; a receipt-import agent only needs `mcp:read` + `mcp:inventory:write`.

Legacy API keys with the blanket **`mcp`** scope still work for manual auth but OAuth uses granular scopes only.

## What MCP will and will not do

MCP is the **deterministic** surface for agents. By design it never charges Ration credits or invokes UI-only AI features:

- **Receipt parsing** happens in the *agent's* LLM (Cursor/Claude). Ration only ingests the resulting structured items via `preview_inventory_import` → `apply_inventory_import`.
- **Cargo embeddings** are deferred during MCP writes (`skipVectorPhase: true`), so adding items via MCP costs **zero credits**.
- **Visual scanning** and **AI meal generation** are reserved for the web app, where the user has explicit credit controls.

If you want these AI capabilities, use the web app. If you want to drive everything from your own LLM, MCP is the surface for you.

## First-party copilot

Ask Ration replaces the old third-party support assistant. It does not use delegated MCP actor tokens. Instead:

1. Web users authenticate with their existing Ration session.
2. iOS users authenticate with their mobile Bearer token.
3. The copilot reuses the same org-scoped server logic and audit patterns as MCP tools.

MCP remains available for external agents and API-key/OAuth clients. The copilot is the native Ration-owned chat surface.

## Security expectation

OAuth grants can be revoked instantly in Connected Agents. API keys should be treated like passwords — revoke keys you no longer use. Destructive tools (`remove_cargo_item`, `delete_meal`, `clear_active_meals`) require an explicit `confirm: true` argument as a guardrail against agent slips.

## Next steps

- *Connecting to MCP* — OAuth setup and advanced API key config.
- *MCP tools reference* — full tool list and rate limits.
- *MCP vs web app* — what MCP cannot do.
