# MCP tools reference

All tools are scoped to the **authorized household** (OAuth grant or API key organization). **Most MCP tools do not consume AI credits**; they use **rate limits** instead. Credit-aware exceptions: `start_plan_week` and `start_generate_meal` (same ledger as the native UI, after host approval). Every tool returns a uniform JSON envelope (`{ ok: true, tool, data, warnings?, meta? }` or `{ ok: false, tool, error }`). Failures include `error.code` (including `timeout`), `error.message`, optional `error.details`, and often `error.recoveryHint`. Copilot returns the **same envelope shape** to the model. Tool handlers are capped (~20s) so hung Workers AI/D1 calls cannot stall the agent forever.

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
| `list_inventory` | `mcp:read` | Cursor-paginated cargo list (default 100, max 200). Optional `domain`, `expiresBefore` / `expiresAfter` (UTC YYYY-MM-DD), and `sortBy: expiresAt`. |
| `get_cargo_item` | `mcp:read` | Fetch one item by id with all fields (tags, expiresAt, customFields). |
| `search_ingredients` | `mcp:read` | Semantic search in pantry by meaning. |
| `get_expiring_items` | `mcp:read` | Pantry lines expiring within N UTC calendar days. Defaults to the user's `expirationAlertDays` when `days` is omitted. |
| `get_expired_items` | `mcp:read` | Pantry lines whose expiry date is before today (UTC). |
| `get_kitchen_summary` | `mcp:read` | Single-call kitchen snapshot. Prefer this over `get_context` for status. |
| `add_cargo_item` | `mcp:inventory:write` | Add a single pantry item. Fuzzy Vectorize merge skipped; embeddings backfill async. |
| `update_cargo_item` | `mcp:inventory:write` | Set absolute pantry fields. Quantity may be **0**. |
| `adjust_cargo_item` | `mcp:inventory:write` | Relative quantity change (`delta`). Prefer for “used/ate N”. |
| `remove_cargo_item` | `mcp:inventory:write` | Permanently delete a pantry line. **Requires `confirm: true`.** |

### Receipt → pantry workflow (no credits)

Prefer resource `ration://schemas/inventory-import` for the item shape.

| Tool | Scope | Purpose |
|------|-------|---------|
| `inventory_import_schema` | `mcp:read` | **Deprecated.** Prefer `ration://schemas/inventory-import`. |
| `preview_inventory_import` | `mcp:read` | Dry-run import. Returns `previewToken`, `totals`, sample rows + `rowsOmitted`, warnings. |
| `apply_inventory_import` | `mcp:inventory:write` | Commits a preview after chat confirmation (no second host approval card). Idempotent. Embeddings do not block return. |
| `import_inventory_csv` | `mcp:inventory:write` | Parse a CSV string and apply directly. |

## Galley (Meals)

| Tool | Scope | Purpose |
|------|-------|---------|
| `list_meals` | `mcp:read` | Cursor-paginated recipe list. |
| `match_meals` | `mcp:read` | Cookability match (`strict` / `delta`). |
| `create_meal` | `mcp:galley:write` | Create structured recipe (credit-free). |
| `update_meal` | `mcp:galley:write` | Update a recipe. |
| `delete_meal` | `mcp:galley:write` | Delete a recipe. **Requires `confirm: true`.** |
| `set_active_meals` | `mcp:galley:write` | Set active selection to exactly `mealIds`. Optional `syncSupply`. |
| `toggle_meal_active` | `mcp:galley:write` | Toggle one meal in the active list. |
| `clear_active_meals` | `mcp:galley:write` | Clear all active selections. **Requires `confirm: true`.** |
| `consume_meal` | `mcp:galley:write` + `mcp:inventory:write` | Cook by mealId and deduct cargo. |
| `start_generate_meal` | `mcp:galley:write` | **Credits.** Queues AI meal generation after approval. Deep link: `ration://galley/generate`. |

## Manifest (Meal plan)

| Tool | Scope | Purpose |
|------|-------|---------|
| `get_meal_plan` | `mcp:read` | Meal plan entries for a date range. |
| `propose_manifest_plan` | `mcp:read` | Compact week proposal from expiring + match_meals. No writes. |
| `commit_manifest_plan` | `mcp:manifest:write` | Commit confirmed entries; optional supply sync. Approval required. |
| `add_meal_plan_entry` | `mcp:manifest:write` | Schedule one meal. |
| `bulk_add_meal_plan_entries` | `mcp:manifest:write` | Batch add (max 50). |
| `update_meal_plan_entry` | `mcp:manifest:write` | Patch an unconsumed entry. |
| `consume_manifest_entries` | `mcp:manifest:write` + `mcp:inventory:write` | Mark plan entries cooked. |
| `remove_meal_plan_entry` | `mcp:manifest:write` | Remove a scheduled entry. |
| `start_plan_week` | `mcp:manifest:write` | **Credits.** Queues AI Plan Week after approval. Deep link: `ration://manifest/plan-week`. |

## Supply (Shopping)

| Tool | Scope | Purpose |
|------|-------|---------|
| `get_supply_list` | `mcp:read` | Active shopping list. |
| `add_supply_item` | `mcp:supply:write` | Add a line. |
| `update_supply_item` | `mcp:supply:write` | Patch a line. |
| `remove_supply_item` | `mcp:supply:write` | Remove a line. |
| `mark_supply_purchased` | `mcp:supply:write` | Toggle purchased on one line. |
| `mark_supply_purchased_bulk` | `mcp:supply:write` | Mark many lines purchased (max 50). |
| `sync_supply_from_selected_meals` | `mcp:supply:write` | Rebuild supply from plan + selections. |
| `complete_supply_list` | `mcp:supply:write` | Dock purchased → cargo. |

## Account & preferences

| Tool | Scope | Purpose |
|------|-------|---------|
| `get_context` | `mcp:read` | Org/key context, slim kitchen tier/credits, capabilities. Prefer `get_kitchen_summary` for full status. |
| `get_billing_summary` | `mcp:read` | Tier, credits, renewal, billing links. |
| `get_user_preferences` | `mcp:read` | Allergens, alert days, theme, units. |
| `update_user_preferences` | `mcp:preferences:write` | Patch preferences. |

## Not exposed

- Camera/OCR receipt scan as a tool (text → preview/apply, or native Scan)
- Recipe URL extraction without native import (`ration://galley/import`)

Large Galley JSON imports use the REST API with `galley` scope—not MCP.
