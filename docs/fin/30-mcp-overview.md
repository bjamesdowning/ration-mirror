# MCP overview

## What MCP is

**Model Context Protocol (MCP)** lets desktop AI tools (for example **Cursor**, **Claude Desktop**) call Ration on your behalf: list pantry items, update supply, plan meals, and more. Ration exposes a dedicated MCP endpoint on a separate Cloudflare Worker that shares the same database and search stack as the web app.

## Host and authentication

- **Host:** `mcp.ration.mayutic.com` (production).
- **Auth:** HTTP **Bearer** token using a Ration **API key** whose scope includes **`mcp`** *or* one or more fine-grained **`mcp:*`** scopes.
- **Data scope:** All tools operate on **one organization**—the org bound to that API key.

## Scopes (least privilege)

Legacy keys with the `mcp` scope continue to work as full-access. New keys can use narrow scopes for least-privilege agents:

- **`mcp:read`** — list/search inventory, meals, plan, expiring items, user preferences (no mutation).
- **`mcp:inventory:write`** — `add_cargo_item`, `update_cargo_item`, `remove_cargo_item`, `apply_inventory_import`, `import_inventory_csv`.
- **`mcp:galley:write`** — `create_meal`, `update_meal`, `delete_meal`, `consume_meal`, `toggle_meal_active`, `clear_active_meals`.
- **`mcp:manifest:write`** — meal-plan entry CRUD and bulk add.
- **`mcp:supply:write`** — supply list item CRUD, mark purchased, sync from selected meals, `complete_supply_list`.
- **`mcp:preferences:write`** — `update_user_preferences` (allergens, expiration alert days, theme).

Pick the smallest set that covers the agent's job. A read-only research agent only needs `mcp:read`; a receipt-import agent only needs `mcp:read` + `mcp:inventory:write`.

## Creating a key

In **Hub → Settings**, create an API key and enable one or more MCP scopes. The raw key is shown **once**—store it in a password manager.

## What MCP will and will not do

MCP is the **deterministic** surface for agents. By design it never charges Ration credits or invokes UI-only AI features:

- **Receipt parsing** happens in the *agent's* LLM (Cursor/Claude). Ration only ingests the resulting structured items via `preview_inventory_import` → `apply_inventory_import`.
- **Cargo embeddings** are deferred during MCP writes (`skipVectorPhase: true`), so adding items via MCP costs **zero credits**.
- **Visual scanning** and **AI meal generation** are reserved for the web app, where the user has explicit credit controls.

If you want these AI capabilities, use the web app. If you want to drive everything from your own LLM, MCP is the surface for you.

## Security expectation

Treat MCP keys like passwords. Anyone with the key can read and mutate org data allowed by the granted scopes — revoke keys you no longer use. Destructive tools (`remove_cargo_item`, `delete_meal`, `clear_active_meals`) require an explicit `confirm: true` argument as a guardrail against agent slips.

## Next steps

- *Connecting to MCP* — header format and client config.
- *MCP tools reference* — full tool list and rate limits.
- *MCP vs web app* — what MCP cannot do.
