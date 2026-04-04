# MCP tools reference

All tools are scoped to the **API key’s organization**. **MCP calls do not consume AI credits**; they use **rate limits** instead.

## Rate limit categories

| Category | Typical limit | Applies to |
|----------|----------------|------------|
| `mcp_list` | 30 per 60s per org | Most read tools |
| `mcp_search` | 20 per 60s per org | Semantic search + meal match |
| `mcp_write` | 15 per 60s per org | Most writes |
| `mcp_supply_sync` | 8 per 60s per org | Heavy supply rebuild |

Exact windows may be tuned; if you hit limits, wait for the window to reset.

## Read tools

| Tool | Purpose |
|------|---------|
| `search_ingredients` | Semantic search in pantry by meaning (not exact string). |
| `list_inventory` | Full cargo list; optional `domain` filter (food / household / alcohol). |
| `get_supply_list` | Active shopping list with items and related meal names. |
| `get_meal_plan` | Meal plan entries for a date range (default ~7 days). |
| `list_meals` | All recipes/provisions with ingredients; optional `tag` filter. |
| `match_meals` | Meals you can cook (`strict`) or partial matches (`delta`) with gaps. |
| `get_expiring_items` | Pantry lines expiring within N days (default 7). |
| `get_credit_balance` | Organization AI credit balance. |

## Write tools

| Tool | Purpose |
|------|---------|
| `add_supply_item` | Add a line to the supply list. |
| `update_supply_item` | Change name, quantity, or unit on a supply line. |
| `remove_supply_item` | Remove a supply line. |
| `mark_supply_purchased` | Toggle purchased flag. |
| `add_cargo_item` | Add pantry stock. |
| `update_cargo_item` | Update pantry fields (quantity, unit, expiry, domain, tags). |
| `remove_cargo_item` | Remove a pantry item. |
| `consume_meal` | Cook a meal and deduct ingredients from cargo. |
| `create_meal` | Create a Galley recipe from structured data. |
| `update_meal` | Update a recipe; pass full meal payload from `list_meals` with edits. |
| `add_meal_plan_entry` | Schedule a meal on a date and slot (breakfast/lunch/dinner/snack). |
| `update_meal_plan_entry` | Patch date, slot, servings override, notes, or order. |
| `remove_meal_plan_entry` | Remove a scheduled entry by id. |
| `sync_supply_from_selected_meals` | Rebuild supply from manifest + Galley selections (same idea as Supply → Update list). |

## Bulk Galley import

Large JSON imports use the **REST API** with **`galley`** scope—not MCP.

If a tool is missing in your client, update the MCP bridge and confirm the **`mcp`** API key scope.
