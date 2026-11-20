# MCP tools reference

**Source of truth:** the developer reference [`docs/mcp/README.md`](https://gitlab.com/mayutic/ration/application/-/blob/main/docs/mcp/README.md) is the source of truth for MCP tool names and behaviour. The server registers its tools from `app/lib/mcp/tools/`. This article is the user-facing summary; if the two ever disagree, trust `docs/mcp/README.md`.

All tools are scoped to the **authorized household** (OAuth grant or API key organization). Nutrition **read** tools (`get_nutrition_summary`, `list_nutrition_intakes`) return the **caller’s personal diary**; when `nutrition-cross-org-diary` is on, totals/history include intakes from every kitchen that user logged—not “household nutrition.” Writes still authorize against the grant kitchen for that entry. **MCP and Copilot kitchen tools do not consume AI credits**; they use **rate limits** instead. The one exception is the optional photo food log (`propose_food_log`, see *Food diary tools* below), which costs 2 credits per model call. Billed Gemini jobs (scan, URL import, Galley Generate, Plan Week) stay on native web/iOS only. Copilot invents meals with `create_meal` and fills a week with `propose_manifest_plan` → `commit_manifest_plan`. Every tool returns a uniform JSON envelope (`{ ok: true, tool, data, warnings?, meta? }` or `{ ok: false, tool, error }`). Failures include `error.code` (including `timeout`), `error.message`, optional `error.details`, and often `error.recoveryHint`. Copilot returns the **same envelope shape** to the model. Tool handlers are capped (~20s) so hung Workers AI/D1 calls cannot stall the agent forever.

## Access and plan

- **Free plan includes MCP.** Every plan, including Free, gets full MCP access with OAuth. Free-plan capacity limits (Cargo items, Meals, Supply Lists) still apply to what tools can create.
- **OAuth sign-in only uses `authorization_code` and `refresh_token`.** Ration does not support the `client_credentials` grant, so every MCP token comes from a person signing in and approving the household and scopes.
- **Local clients can use any loopback port.** Public clients that use PKCE (no client secret) may redirect to `http://127.0.0.1`, `http://[::1]` or `http://localhost` on any port, as long as the path matches the registered redirect. Clients with a secret need an exact redirect match.
- **API keys** with `mcp:*` scopes are the advanced alternative. See *Connecting to MCP*.

## Confirmations and destructive tools

These six tools always ask for approval in hosts that support it, are marked `destructiveHint: true` in `tools/list`, and refuse to run unless you pass `confirm: true`. Without it they return `invalid_input` and change nothing:

| Tool | What it changes |
|------|-----------------|
| `delete_meal` | Deletes a Meal and its linked Manifest entries |
| `clear_active_meals` | Clears every active Galley selection |
| `remove_cargo_item` | Permanently deletes a Cargo item |
| `import_inventory_csv` | Adds or overwrites Cargo items from a CSV |
| `commit_manifest_plan` | Writes a multi-entry Manifest plan (and can sync Supply) |
| `complete_supply_list` | Docks purchased Supply Items into Cargo and removes them from the list |

`clear_nutrition_goal` and `clear_manifest_intake` also require `confirm: true` and host approval. Ask Ration (Copilot) passes `confirm: true` only after you tap **Approve**.

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
| `get_cargo_item` | `mcp:read` | Fetch one item by id (name, quantity, unit, domain, tags, expiresAt, nutrition when present). |
| `search_ingredients` | `mcp:read` | Semantic search in pantry by meaning (recall 0.60). Each hit includes `matchScore` and `cookMatch` (true at ≥ 0.78). |
| `get_expiring_items` | `mcp:read` | Pantry lines expiring within N UTC calendar days. Defaults to the user's `expirationAlertDays` when `days` is omitted. |
| `get_expired_items` | `mcp:read` | Pantry lines whose expiry date is before today (UTC). |
| `get_kitchen_summary` | `mcp:read` | Single-call kitchen snapshot. Prefer this over `get_context` for status. Manifest `status` is `planned` or `cooked`. `loggedByYou` is caller-only and omitted without nutrition read, `nutrition-manifest`, and intake consent. When `mcp:nutrition:read` is granted, may include caller-only `personalNutritionToday`. |
| `get_kitchen_events` | `mcp:read` | Flight Recorder timeline (filter by event type / date range; paginated). |
| `get_kitchen_stats` | `mcp:read` | Flight Recorder aggregates (7d/30d/90d/365d counts + top cooked meals). |
| `add_cargo_item` | `mcp:inventory:write` | Add a single pantry item. Fuzzy Vectorize merge skipped; embeddings backfill async. |
| `update_cargo_item` | `mcp:inventory:write` | Set absolute pantry fields. Quantity may be **0**. |
| `adjust_cargo_item` | `mcp:inventory:write` | Relative quantity change (`delta`). Exact name, or a semantic match at ≥ 0.78. A weaker name returns candidates and does not change quantity. Prefer for pantry used/wasted, not personal eating. |
| `remove_cargo_item` | `mcp:inventory:write` | Permanently delete a pantry line. **Requires `confirm: true`** (Copilot host Approve binds confirm). |

### Receipt → pantry workflow (no credits)

Prefer resource `ration://schemas/inventory-import` for the item shape.

| Tool | Scope | Purpose |
|------|-------|---------|
| `preview_inventory_import` | `mcp:inventory:write` | Dry-run import. Returns `previewToken`, `totals`, sample rows + `rowsOmitted`, warnings. |
| `apply_inventory_import` | `mcp:inventory:write` | Commits a preview after chat confirmation (no second host approval card). Idempotent. Embeddings do not block return. |
| `import_inventory_csv` | `mcp:inventory:write` | Parse a CSV string and apply directly. Destructive (adds or overwrites Cargo). Approval required; **requires `confirm: true`**. Prefer preview → apply for large or untrusted input. |

### Bulk Cargo remove (no credits)

| Tool | Scope | Purpose |
|------|-------|---------|
| `preview_inventory_remove` | `mcp:inventory:write` | Dry-run bulk deletes (prefer for **2+** items). |
| `apply_inventory_remove` | `mcp:inventory:write` | Commits a remove preview after chat confirmation (no second host card). Idempotent. |

## Galley (Meals)

| Tool | Scope | Purpose |
|------|-------|---------|
| `list_meals` | `mcp:read` | Galley index. Ingredients omitted unless `includeIngredients` is true. |
| `get_meal` | `mcp:read` | One recipe by id, including directions and ingredients. |
| `match_meals` | `mcp:read` | Cookability match (`strict` / `delta`). Includes compact `nutrition.perServing` and optional `maxEnergyKcal` (unknown kcal stays listed). |
| `create_meal` | `mcp:galley:write` | Create structured recipe (credit-free). |
| `update_meal` | `mcp:galley:write` | Update a recipe. |
| `delete_meal` | `mcp:galley:write` | Delete a recipe. **Requires `confirm: true`.** Cascades to ingredients, tags, and linked meal plan entries. Returns `deletedPlanEntryCount`. |
| `set_active_meals` | `mcp:galley:write` | Set active selection to exactly `mealIds`. Optional `syncSupply` (host approval only when syncing). |
| `clear_active_meals` | `mcp:galley:write` | Clear all active selections. **Requires `confirm: true`.** |
| `consume_meal` | `mcp:galley:write` + `mcp:inventory:write` | Cook by mealId and deduct cargo. When nutrition-cook-log-split is on, bridges to today’s Manifest (Prepared); never logs personal intake (`offerPersonalLog` hint only). |

## Manifest (Meal plan)

| Tool | Scope | Purpose |
|------|-------|---------|
| `get_meal_plan` | `mcp:read` | Meal plan entries for a date range. `days` defaults to 7 (inclusive, max 14). Omitted `startDate` is today UTC. `status` is `planned` or `cooked` (`cookedAt` or legacy `consumedAt`). `personalIntake` and `loggedByYou` when nutrition flags, `mcp:nutrition:read`, and intake consent allow; `gramsPerServing` when recipe mass is known. Cooking is not eating. |
| `propose_manifest_plan` | `mcp:read` | Compact week proposal from expiring + match_meals. No writes. |
| `commit_manifest_plan` | `mcp:manifest:write` | Commit confirmed entries (max 50); optional supply sync. Destructive. Approval required; **requires `confirm: true`**. |
| `add_meal_plan_entry` | `mcp:manifest:write` | Schedule one meal. |
| `update_meal_plan_entry` | `mcp:manifest:write` | Patch an unconsumed entry. |
| `cook_manifest_entries` | `mcp:manifest:write` + `mcp:inventory:write` | Shared Cook: deduct Cargo once and mark Prepared. Requires nutrition-cook-log-split. Never logs intake. |
| `consume_manifest_entries` | `mcp:manifest:write` + `mcp:inventory:write` | Legacy combined consume. **Refused** when nutrition-cook-log-split is on (`cook_eat_split_required`). Does **not** write personal intake. `logNutrition` and `portions` are ignored. |
| `remove_meal_plan_entry` | `mcp:manifest:write` | Remove a scheduled entry. |

## Nutrition

Gated by nutrition feature flags. Not medical advice. Cargo/meal read and write tools may include a `nutrition` snapshot when present. Require `mcp:nutrition:read` / `mcp:nutrition:write`. Legacy broad `mcp` never grants nutrition; migrate keys to explicit kitchen scopes and re-issue or re-consent for nutrition. Agent personal nutrition reads are value-free audited (fail closed). Tools return schema-valid `structuredContent` plus text; clears and multi-entry intake writes need host approval. Mutation timeouts return `timeout_ambiguous` — retry with the same `operationKey`.

| Tool | Scope | Purpose |
|------|-------|---------|
| `get_nutrition_summary` | `mcp:nutrition:read` | Daily intake totals (energy + macros + optional fiber) for a UTC date range, plus active goal and additive `vsGoal` remaining/overage for the last day. `from`/`to` default to today UTC. Requires nutrition-goals or nutrition-manifest. |
| `list_nutrition_intakes` | `mcp:nutrition:read` | Row-level personal intake history for a UTC range (cursor-paginated). |
| `set_nutrition_goal` | `mcp:nutrition:write` | Idempotently upsert a personal daily goal using `operationKey` (active consent required). Requires nutrition-goals. Store only numbers the person states. Do not suggest, calculate, or invent a target. |
| `clear_nutrition_goal` | `mcp:nutrition:write` | Idempotently clear the active goal as of a date using `operationKey`. Requires nutrition-goals. **`confirm: true`.** |
| `log_manifest_intake` | `mcp:nutrition:write` | Atomic private Eat / plate-up for prepared entries (`operationKey` + `portions[]` with per-item keys). `servings` is 0.01–100, or `amount`+`unit` (`serving` \| `g` \| `oz`) when `get_meal_plan` `gramsPerServing` is present. Consent must already be active in Ration. Never deducts Cargo. Optional `notes` (≤280) persist only when nutrition-intake-notes is on. |
| `clear_manifest_intake` | `mcp:nutrition:write` | Atomically soft-void personal intake using `operationKey`. **`confirm: true`.** Does not uncook. |
| `quick_eat_cargo` | `mcp:inventory:write` + `mcp:manifest:write` + `mcp:nutrition:write` | Personal Quick Eat: resolve by `cargoId`, exact name, or a semantic match at ≥ 0.78. A weaker name returns candidates and does not eat or create. Otherwise creates a missing line then eats (net 0 restock reminder). Manifest snack + optional private intake. Requires cargo-quick-eat + nutrition-cook-log-split. |

## Food diary tools (when enabled)

These personal Macro Tracking tools only appear when the matching nutrition features are on for your account (all need `nutrition-fast-log`; iOS below 1.6.0 stays disabled). They act on **your** diary, not the shared kitchen, unless the tool says otherwise. Not medical advice.

| Tool | Scope | Purpose |
|------|-------|---------|
| `quote_food_log` | `mcp:nutrition:read` | Quote the credit cost of a food log before it runs. Typed, recent and custom-macro logs cost 0. No writes. |
| `log_diary_food` | `mcp:nutrition:write` | Log one food you ate (typed macros or a saved food). Approval required. Does not change Cargo, Galley, Manifest or Supply. 0 credits. |
| `update_diary_food` | `mcp:nutrition:write` | Replace one of your food logs. Approval required. 0 credits. |
| `void_diary_food` | `mcp:nutrition:write` | Void one of your food logs. Destructive; approval required; **requires `confirm: true`**. |
| `save_diary_food_to_kitchen` | `mcp:nutrition:write` | Copy a food log into the kitchen as a Cargo item or a Meal. Destructive for the shared kitchen; approval required; **requires `confirm: true`**. |
| `set_diary_layout` | `mcp:preferences:write` | Choose timeline or slots for your own day list. Approval required. |
| `list_saved_foods` | `mcp:nutrition:read` | Your saved foods (needs `nutrition-saved-food`). |
| `save_food` | `mcp:nutrition:write` | Save a food for yourself (needs `nutrition-saved-food`). Approval required. |
| `delete_saved_food` | `mcp:nutrition:write` | Delete one of your saved foods (needs `nutrition-saved-food`). Approval required; **requires `confirm: true`**. |
| `lookup_food_barcode` | `mcp:nutrition:read` | Look up a packaged barcode in USDA Branded Foods (needs `nutrition-barcode-diary`). No writes. |
| `propose_food_log` | `mcp:nutrition:write` | Draft a food log from a photo (needs `nutrition-photo-log`). A model call costs **2 credits**. Approval required. Commit with `log_diary_food`. |
| `get_health_export_status` | `mcp:nutrition:read` | Read the Apple Health export switch (needs `nutrition-health-export`). |
| `get_health_export_preview` | `mcp:nutrition:read` | Preview the eaten foods you could export (needs `nutrition-health-export`). |
| `set_health_export` | `mcp:nutrition:write` | Turn Apple Health export on or off (needs `nutrition-health-export`). Approval required; **requires `confirm: true`**. |
| `clear_health_export` | `mcp:nutrition:write` | Ask your phone to delete the samples Ration wrote (needs `nutrition-health-export`). Destructive; approval required; **requires `confirm: true`**. |

## Supply (Shopping)

| Tool | Scope | Purpose |
|------|-------|---------|
| `get_supply_list` | `mcp:read` | Live Supply, cursor default 50 max 100 (optional `listId` when the supply list library is enabled). No MCP tool can turn that library on. |
| `add_supply_item` | `mcp:supply:write` | Add a line to Live Supply. Optional `listId` writes a saved list when the library is enabled. Does not check off or dock. No note or tag fields. |
| `update_supply_item` | `mcp:supply:write` | Patch a Live Supply line (name, quantity, or unit). No note field. |
| `remove_supply_item` | `mcp:supply:write` | Remove a line. |
| `mark_supply_purchased_bulk` | `mcp:supply:write` | Mark one or many lines purchased (max 50). |
| `sync_supply_from_selected_meals` | `mcp:supply:write` | Rebuild supply from plan + selections. Reports net new, removed, and changed lines. |
| `complete_supply_list` | `mcp:supply:write` + `mcp:inventory:write` | Dock purchased Live Supply items → Cargo. Saved lists cannot be docked. Requires **both** scopes. Destructive. Approval required; **requires `confirm: true`**. |
| `list_supply_lists` | `mcp:read` | Live, Saved, Template, and Archived lists (when saved lists are enabled for your account). |
| `create_supply_list` | `mcp:supply:write` | Create a Saved or Template list (when saved lists are enabled). |
| `duplicate_supply_list` | `mcp:supply:write` | Duplicate a list into an independent copy (when saved lists are enabled). |
| `archive_supply_list` | `mcp:supply:write` | Archive a Saved list (when saved lists are enabled). |
| `transfer_supply_items` | `mcp:supply:write` | Copy or move items between lists (when saved lists are enabled). |
| `manage_supply_staples` | `mcp:supply:write` | List, upsert, or delete kitchen staples (when saved lists are enabled). |
| `save_receipt_as_supply_list` | `mcp:supply:write` | Save reviewed receipt lines as a Saved list, without a second AI credit (when saved lists are enabled). |

## Account & preferences

| Tool | Scope | Purpose |
|------|-------|---------|
| `get_context` | `mcp:read` | Org/key context, slim kitchen tier/credits, capabilities. Prefer `get_kitchen_summary` for full status. |
| `get_billing_summary` | `mcp:read` | Tier, credits, renewal, billing links. |
| `get_user_preferences` | `mcp:read` | Allergens, alert days, theme, units. |
| `update_user_preferences` | `mcp:preferences:write` | Patch preferences. |

## Not exposed

- Camera/OCR receipt scan as a tool (text → preview/apply, or native Scan)
- Recipe URL scraping (`start_import_url` does not exist). Copilot hard-blocks URL paste → Galley Import. MCP clients extract caption/page text with the client LLM, then `create_meal`.
- Billed Galley Generate / Manifest Plan Week as tools. Use `create_meal` and `propose_manifest_plan` → `commit_manifest_plan`. Native buttons remain on web/iOS.

Large Galley JSON imports use the REST API with `galley` scope—not MCP.
