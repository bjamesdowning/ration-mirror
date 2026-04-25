# MCP tools reference

All tools are scoped to the **API key's organization**. **MCP calls do not consume AI credits**; they use **rate limits** instead. Every tool returns a uniform JSON envelope (`{ ok: true, tool, data, meta? }` or `{ ok: false, tool, error }`) so agents can parse responses deterministically.

## Rate limit categories

| Category | Typical limit | Applies to |
|----------|----------------|------------|
| `mcp_list` | 30 per 60s per org | Most read tools |
| `mcp_search` | 20 per 60s per org | Semantic search + meal match |
| `mcp_write` | 15 per 60s per org | Most writes |
| `mcp_supply_sync` | 8 per 60s per org | Heavy supply rebuild |
| `mcp_write_per_key` | 15 per 60s **per key** | Defends against compromised keys |

Exact windows may be tuned; if you hit limits, wait for the window to reset. Rate-limit details are also returned in the envelope's `error.retryAfter` and structured `meta.rateLimit` fields.

## Inventory (Cargo)

| Tool | Scope | Purpose |
|------|-------|---------|
| `list_inventory` | `mcp:read` | Cursor-paginated cargo list (default 100, max 200). Returns `meta.nextCursor` when more pages remain. Optional `domain` filter. |
| `get_cargo_item` | `mcp:read` | Fetch one item by id with all fields (tags, expiresAt, customFields). |
| `search_ingredients` | `mcp:read` | Semantic search in pantry by meaning. |
| `get_expiring_items` | `mcp:read` | Pantry lines expiring within N days (default 7). |
| `add_cargo_item` | `mcp:inventory:write` | Add pantry stock. Skips embedding generation (zero credit cost). |
| `update_cargo_item` | `mcp:inventory:write` | Update pantry fields (quantity, unit, expiry, domain, tags). |
| `remove_cargo_item` | `mcp:inventory:write` | Remove a pantry item. **Requires `confirm: true`.** |

### Receipt → pantry workflow (no credits)

| Tool | Scope | Purpose |
|------|-------|---------|
| `inventory_import_schema` | `mcp:read` | Returns the exact JSON shape `preview_inventory_import` and `apply_inventory_import` expect. |
| `preview_inventory_import` | `mcp:read` | Validates and classifies items as `match`/`new`/`skip`. Returns a `previewToken` valid for 10 minutes. |
| `apply_inventory_import` | `mcp:inventory:write` | Applies a preview. Idempotent via `idempotencyKey` (replays return the original result). |
| `import_inventory_csv` | `mcp:inventory:write` | Convenience: parse a CSV string and apply directly. |

The intended pattern is: agent's LLM parses a receipt → calls `preview_inventory_import` to confirm → user approves → agent calls `apply_inventory_import` with the `previewToken`. Ration never sees the receipt image and never spends credits.

## Galley (Meals)

| Tool | Scope | Purpose |
|------|-------|---------|
| `list_meals` | `mcp:read` | Cursor-paginated recipe list. Pass `includeIngredients: false` to skip ingredient fan-out. |
| `match_meals` | `mcp:read` | Meals you can cook (`strict`) or partial matches (`delta`) with gaps. |
| `create_meal` | `mcp:galley:write` | Create a recipe from structured data. |
| `update_meal` | `mcp:galley:write` | Update a recipe; pass full meal payload from `list_meals` with edits. |
| `delete_meal` | `mcp:galley:write` | Delete a recipe. **Requires `confirm: true`.** |
| `consume_meal` | `mcp:galley:write` + `mcp:inventory:write` | Cook a meal and deduct ingredients from cargo. |
| `toggle_meal_active` | `mcp:galley:write` | Mark a meal active/inactive in the current selection. |
| `clear_active_meals` | `mcp:galley:write` | Clear all active meal selections. **Requires `confirm: true`.** |

## Manifest (Meal plan)

| Tool | Scope | Purpose |
|------|-------|---------|
| `get_meal_plan` | `mcp:read` | Meal plan entries for a date range (default ~7 days). |
| `add_meal_plan_entry` | `mcp:manifest:write` | Schedule a meal on a date and slot (breakfast/lunch/dinner/snack). |
| `bulk_add_meal_plan_entries` | `mcp:manifest:write` | Add multiple entries in one call (idempotency-key supported). |
| `update_meal_plan_entry` | `mcp:manifest:write` | Patch date, slot, servings override, notes, or order. Cannot edit consumed entries. |
| `remove_meal_plan_entry` | `mcp:manifest:write` | Remove a scheduled entry by id. |

## Supply (Shopping)

| Tool | Scope | Purpose |
|------|-------|---------|
| `get_supply_list` | `mcp:read` | Active shopping list with items and related meal names. |
| `add_supply_item` | `mcp:supply:write` | Add a line to the supply list. |
| `update_supply_item` | `mcp:supply:write` | Change name, quantity, or unit on a supply line. |
| `remove_supply_item` | `mcp:supply:write` | Remove a supply line. |
| `mark_supply_purchased` | `mcp:supply:write` | Toggle purchased flag. |
| `sync_supply_from_selected_meals` | `mcp:supply:write` | Rebuild supply from manifest + Galley selections. |
| `complete_supply_list` | `mcp:supply:write` | Archive the current list and start a fresh one. |

## Account & preferences

| Tool | Scope | Purpose |
|------|-------|---------|
| `get_context` | `mcp:read` | Returns the org/key context the request is operating under. |
| `get_user_preferences` | `mcp:read` | Allergens, expiration alert days, theme, default unit mode. |
| `update_user_preferences` | `mcp:preferences:write` | Patch one or more preference fields. |

## What MCP intentionally does **not** expose

These features remain web-app-only because they spend credits or are inherently UI-driven:

- `get_credit_balance` — UI surface, not relevant to agent flows.
- AI receipt scanning, AI meal generation, semantic vector ingestion of cargo via MCP writes.

If you need any of these, use the web app or the REST API with the appropriate non-MCP scopes.

## Bulk Galley import

Large JSON imports continue to use the **REST API** with **`galley`** scope—not MCP.

If a tool is missing in your client, update the MCP bridge and confirm the API key has the right scope (legacy `mcp` or the new fine-grained `mcp:*` scopes).
