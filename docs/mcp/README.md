**Repository:** [gitlab.com/mayutic/ration/application](https://gitlab.com/mayutic/ration/application) — hosts **Ration**, an AI-powered kitchen management app, and its dedicated **MCP server** (`mcp.ration.mayutic.com`).

# Ration MCP Server

> **AI-powered kitchen management for your assistant** — live pantry inventory, cook-from-stock recipes, weekly meal plans, and shopping lists. **AI connectivity via MCP** (Model Context Protocol) lets Claude, Cursor, ChatGPT, and other agents read and update your kitchen with scoped OAuth consent — same data as the web app, no shadow copy.

**Homepage:** [ration.mayutic.com](https://ration.mayutic.com) · **Connect:** [ration.mayutic.com/connect](https://ration.mayutic.com/connect) · **Start free** — no credit card required.

---

## The complete kitchen loop for your AI

Most kitchen apps make *you* maintain the spreadsheet. Ration closes the loop:

**Cargo** (pantry) → **Galley** (recipes) → **Manifest** (meal plan) → **Supply** (shopping list) → dock back into Cargo.

Your MCP client operates the same data you see in the web app — not a shadow copy. Semantic matching links recipe ingredients to pantry items even when names differ (`"2% milk"` vs `"whole milk 2%"`). Expiry-aware tools help you cook what you have before it spoils.

**Free to start:** 35 pantry items, 15 recipes, 3 supply lists, 3 Fuel logs per day, full MCP access, and 12 welcome credits for new human accounts. Upgrade to **Crew Member** (€2/month or €12/year) for unlimited capacity, Unlimited Fuel logs, household sharing, and invite links.

---

## Same prompt, better answer

### Without Ration

> "What can I make tonight?"

Your assistant guesses. It does not know what is in your fridge, what expired yesterday, or what is on Thursday's plan.

### With Ration MCP

> "What can I eat tonight that fits my calorie goals?"

`get_nutrition_summary` returns `vsGoal` remaining (UTC day — do not subtract yourself). `match_meals` includes compact per-serving nutrition and optional `maxEnergyKcal`. Ask follow-ups: schedule tonight on Manifest, or Quick Eat a snack.

> "What can I cook tonight with what's in Cargo?"

`match_meals` returns recipes ranked by what you can actually cook — with gaps listed for anything missing. Ask follow-ups: add missing items to Supply, schedule a meal on Manifest, deduct ingredients after you cook.

---

## What you can say

| Prompt | What happens |
|--------|----------------|
| "How's my kitchen?" | `get_kitchen_summary` |
| "What did I cook last week?" | `get_kitchen_events` / `get_kitchen_stats` |
| "List my pantry and what's expiring this week." | `list_inventory` + `get_expiring_items` |
| "What already expired in my pantry?" | `get_expired_items` |
| "What meals can I make with what we have?" | `match_meals` (strict or partial matches; compact nutrition when known) |
| "What can I eat tonight that fits my calorie goals?" | `get_nutrition_summary` (`vsGoal`) → `match_meals` with `maxEnergyKcal` |
| "Plan dinners through Friday and add anything missing to the list." | `propose_manifest_plan` → `commit_manifest_plan` → `sync_supply_from_selected_meals` |
| "We cooked lentil soup for four — update inventory." | `consume_meal` deducts ingredients via semantic matching |
| "Add eggs and butter to the shopping list." | `add_supply_item` |
| "I bought everything on the list — mark it purchased." | `mark_supply_purchased_bulk` |
| "Parse this receipt and add new items to Cargo." | Agent parses text → `preview_inventory_import` → `apply_inventory_import` (no Ration AI credits) |
| "I just ate grapes." | `quick_eat_cargo` (creates a missing line, Manifest snack, optional private intake) |
| "Import this Instagram recipe." | Not an MCP scrape. Client extracts caption/page text → `create_meal`, or native Galley Import |

MCP tool calls are **deterministic and do not consume Ration credits**. The one exception is the flag-gated photo food log (`propose_food_log`), which costs 2 credits per model call. Receipt parsing and recipe extraction from pasted text run in *your* LLM; Ration ingests structured items. Visual scan and URL import in the web/iOS app use optional credit packs. Copilot Ask is the same kitchen tools plus a conversation token meter.

---

## Why Ration MCP is different

- **Closed-loop kitchen ops** — inventory, recipes, plan, and shop list in one system (not four apps).
- **35+ MCP tools** — granular OAuth scopes (`mcp:read`, `mcp:inventory:write`, `mcp:galley:write`, `mcp:manifest:write`, `mcp:supply:write`, `mcp:preferences:write`, `mcp:nutrition:read`, `mcp:nutrition:write`), including optional nutrition summary/goals and Quick Eat when flags are on.
- **OAuth-first** — paste one URL; browser sign-in; revoke anytime in Hub → Settings → Connected Agents.
- **Agent self-registration** — autonomous agents can provision a kitchen via [`auth.md`](https://ration.mayutic.com/auth.md) before a human signs up.
- **Household-scoped** — one organization per grant; pick the correct household at consent.
- **Edge-hosted** — Cloudflare Workers, D1, Vectorize semantic search.

---

## Connect in about 2 minutes

### OAuth (recommended)

1. In your MCP client, add server URL:

   ```
   https://mcp.ration.mayutic.com/mcp
   ```

2. Complete browser sign-in, **select your household**, and approve scopes.
3. Ask: *"List my Ration pantry."*

**Works with:** Cursor · Claude Desktop · Claude Code · ChatGPT desktop · Zed · any MCP client with OAuth 2.1 discovery

**One-click setup:** [ration.mayutic.com/connect](https://ration.mayutic.com/connect)

### Advanced: API key

Create an organization API key with `mcp:*` scopes in Hub → Settings → API Keys. Use a Bearer header or `mcp-remote` bridge. See [API docs](https://ration.mayutic.com/docs/api#mcp).

### Autonomous agents (agent-first onboarding)

Your MCP client can provision a kitchen without human signup:

1. Read [auth.md](https://ration.mayutic.com/auth.md) for the registration and claim contract.
2. `POST /api/agent/auth` with `{ "type": "anonymous" }` — returns a **full-write** API key, claim URL, and MCP endpoint (once).
3. Configure MCP with the returned key as a Bearer header.
4. Human claims via OTP at [ration.mayutic.com/connect/claim](https://ration.mayutic.com/connect/claim) whenever ready.

Full walkthrough with client-specific setup (Claude, Cursor, ChatGPT, Goose): [Agent-First MCP Onboarding](https://ration.mayutic.com/blog/agent-first-mcp-onboarding).

---

## MCP tools reference

All tools are scoped to the authorized household. **MCP calls do not consume Ration credits** (except `propose_food_log`, below). Destructive tools require `confirm: true`: without it they return `invalid_input` and change nothing. The six always-approval tools (`delete_meal`, `clear_active_meals`, `remove_cargo_item`, `import_inventory_csv`, `commit_manifest_plan`, `complete_supply_list`) also advertise `destructiveHint: true`.

OAuth issues tokens only through `authorization_code` and `refresh_token`; there is no `client_credentials` grant. Public PKCE clients may use a loopback redirect (`http://127.0.0.1`, `http://[::1]`, `http://localhost`) on any port.

**Reply shape.** Dates and times in tool results are ISO 8601 strings (an invalid date is `null`, never `{}`). In this phase, replies omit kitchen ids, along with user, membership, consent, credential, and API key ids that an agent cannot act on. Later, kitchen ids will be available only through `list_kitchens` (and an optional `kitchenId` on tools), limited to kitchens in the grant. Entity ids you pass back to other tools (Cargo, meal, Manifest entry, intake, supply list) are kept. Identifiers for things you own, such as Health sample sync identifiers and the Cargo id inside a pagination cursor, stay visible to you.

### Read & account

| Tool | Scope | Description |
|------|-------|-------------|
| `get_billing_summary` | `mcp:read` | Tier, credits, renewal, and billing links. The kitchen appears by name and role, without its id. |
| `get_context` | `mcp:read` | Return caller identity (auth method and a readable key name), scopes, kitchen tier/usage/credits/lastActivityAt, capabilities, suggested next actions, and `temporal` (todayUtc, server time, expiry semantics). Safe to call first. |
| `search_ingredients` | `mcp:read` | Semantic pantry search (recall 0.60). Each hit includes `matchScore` and `cookMatch` (true at ≥ 0.78). |
| `list_inventory` | `mcp:read` | Cursor-paginated pantry list (default 100, max 200). Optional domain filter, case-insensitive `nameContains`, `tag` slug, UTC `expiresBefore` / `expiresAfter`, and `sortBy: expiresAt`. `expiresAt` is ISO 8601 or `null`. Includes `nutrition` when present; pass `includeNutrition: false` for a smaller page. |
| `get_cargo_item` | `mcp:read` | Fetch one pantry item by id (name, quantity, unit, domain, tags, expiry, nutrition when present). |
| `get_kitchen_summary` | `mcp:read` | Single-call operational snapshot (cargo, manifest, supply, tier/credits). Optional `manifestDays` (1–7). Manifest `status` is `planned` or `cooked`. `loggedByYou` is the caller's plate-up and is omitted without `mcp:nutrition:read`, `nutrition-manifest`, and intake consent. Cooking is not eating. |
| `get_kitchen_events` | `mcp:read` | Flight Recorder timeline of cooks, docks, expiries, and jettisons (filterable, paginated). |
| `get_kitchen_stats` | `mcp:read` | Flight Recorder aggregates for a window (7d/30d/90d/365d). |
| `get_expiring_items` | `mcp:read` | List items expiring within N UTC calendar days (defaults to user `expirationAlertDays`). |
| `get_expired_items` | `mcp:read` | List items whose expiry date is before today (UTC). Optional `daysBack` (default 30). |
| `list_meals` | `mcp:read` | Galley index (default omits ingredients). Set `includeIngredients: true` to include ingredient lines. Directions are on `get_meal`. |
| `get_meal` | `mcp:read` | One recipe by id from `list_meals`, including directions, ingredients, and nutrition attributions. |
| `match_meals` | `mcp:read` | Find cookable recipes from current pantry — `strict` or `delta`. Adds `allergenFlags` when user allergens are configured. |
| `get_meal_plan` | `mcp:read` | Meal plan entries by date and slot. `days` defaults to 7 (inclusive, max 14). Omitted `startDate` is today UTC. `status` is `planned` or `cooked` (`cookedAt` or legacy `consumedAt`). `personalIntake` and `loggedByYou` when nutrition flags, `mcp:nutrition:read`, and intake consent allow; `gramsPerServing` is recipe-ingredient mass per serving when known. Cooking is not eating. |
| `get_supply_list` | `mcp:read` | Live Supply, cursor-paginated (default 50, max 100). Optional `listId` when the supply list library is on. `sourceMeals` only with `includeSourceMeals: true`. No MCP tool can turn the library on. |
| `list_supply_lists` | `mcp:read` | Catalog of Live, Saved, Template, and Archived lists. Flag-gated. |
| `get_user_preferences` | `mcp:read` | Allergens, expiration alert days, theme, manifest defaults, and other user settings. |
| `update_user_preferences` | `mcp:preferences:write` | Patch user settings (allergens, alerts, theme). Only provided fields change. |
| `get_nutrition_summary` | `mcp:nutrition:read` | Caller’s personal daily intake totals (energy/macros/optional fiber) for a UTC `from`/`to` range (requires `nutrition-goals` or `nutrition-manifest`). `vsGoal` is the last day in the range; `days[].vsGoal` gives remaining per day. When `nutrition-cross-org-diary` is on, includes every kitchen the user logged—not household nutrition. Agent reads audited. |
| `list_nutrition_intakes` | `mcp:nutrition:read` | Caller’s personal intake rows for a UTC range (cursor-paginated; kitchen labels when present). Cross-org when `nutrition-cross-org-diary` is on. Agent reads audited. |
| `set_nutrition_goal` | `mcp:nutrition:write` | Idempotently upsert personal daily energy/macro/fiber goals using `operationKey`; consent must already be active in Ration. Store only numbers the person states. Do not suggest, calculate, or invent a target. Not medical advice. |
| `clear_nutrition_goal` | `mcp:nutrition:write` | Idempotently close open-ended goals using `operationKey`. **Requires `confirm: true` + host approval.** |
| `log_manifest_intake` | `mcp:nutrition:write` | Atomic private Eat for 1–50 prepared entries (`operationKey` + per-item `idempotencyKey`). Portions: `servings` (0.01–100) or `amount`+`unit` (`serving`/`g`/`oz`) when `gramsPerServing` is present. Multi-entry calls need host approval. Consent must already be active in Ration. Returns one compact line per item (`intakeId`, `entryId`, meal, date, slot, portion, energy and macros) plus `dayTotals`. |
| `clear_manifest_intake` | `mcp:nutrition:write` | Atomically soft-void personal intake using `operationKey`. **Requires `confirm: true` + host approval.** |
| `quick_eat_cargo` | `mcp:inventory:write` + `mcp:manifest:write` + `mcp:nutrition:write` | Personal Quick Eat from Cargo: resolve by `cargoId`, exact name, or a semantic match at ≥ 0.78 (a weaker name returns candidates). Creates a missing line if needed. With `plan-fuel-actions` on: deducts Cargo once and logs Daily Fuel on `date` (local noon that day; default today in the person's Fuel zone; the free daily limit counts that day) with `notes`; `logIntake: false` deducts Cargo only and logs no Fuel. Returns `fuelLogged` (and `intakeId` and `fuelDate` when logged). A replay with the same `operationKey` and arguments returns the first result and does not deduct again; a reused key with different arguments is `conflict`. With the flag off: adds a Manifest snack and optionally logs private intake (`cargo-quick-eat` + `nutrition-cook-log-split`). |

### Inventory (Cargo)

| Tool | Scope | Description |
|------|-------|-------------|
| `add_cargo_item` | `mcp:inventory:write` | Add a single pantry item (qty > 0). Optional `nutrition` override; when omitted and `nutrition-engine` is on, USDA auto-resolves. No credits; vectors backfilled async. Prefer import tools for bulk. |
| `update_cargo_item` | `mcp:inventory:write` | Set absolute fields (including optional `nutrition`). Quantity may be **0** (kept as a restock reminder). |
| `adjust_cargo_item` | `mcp:inventory:write` | Relative `delta` change (e.g. `-2`). Floors at 0; keeps the row. Exact name, or a semantic match at ≥ 0.78. A weaker name returns candidates and does not change quantity. |
| `remove_cargo_item` | `mcp:inventory:write` | Permanently delete a pantry line. **Requires `confirm: true`.** |
| `preview_inventory_import` | `mcp:inventory:write` | Dry-run receipt/bulk import — returns `previewToken` and sample rows. Prefer `ration://schemas/inventory-import` for shape. |
| `apply_inventory_import` | `mcp:inventory:write` | Commit a previewed import after the user has seen the preview. Annotated `destructiveHint` and `idempotentHint`, so hosts that support approval ask the user first. Idempotent via `idempotencyKey`. Returns `createdIds` and `updatedIds` so you can act on the new lines without listing Cargo again. |
| `preview_inventory_remove` | `mcp:inventory:write` | Dry-run bulk Cargo deletes (prefer for 2+ items). |
| `apply_inventory_remove` | `mcp:inventory:write` | Commit a remove preview after the user has seen it. Annotated `destructiveHint` and `idempotentHint`, so hosts that support approval ask the user first. Idempotent. |
| `import_inventory_csv` | `mcp:inventory:write` | Parse and apply a CSV string in one call (convenience wrapper). Approval required; pass `confirm: true`. |

### Galley (recipes)

| Tool | Scope | Description |
|------|-------|-------------|
| `create_meal` | `mcp:galley:write` | Create a recipe from structured data. |
| `update_meal` | `mcp:galley:write` | Update a recipe — round-trip via `list_meals` → edit → pass full object. The reply echoes each ingredient's `isOptional`. |
| `delete_meal` | `mcp:galley:write` | Delete a recipe. **Requires `confirm: true`.** Cascades to ingredients, tags, and linked Manifest entries. |
| `set_active_meals` | `mcp:galley:write` | Set Galley active selection to exactly these mealIds. Optional `syncSupply`. |
| `clear_active_meals` | `mcp:galley:write` | Clear all active meal selections. **Requires `confirm: true`.** |
| `consume_meal` | `mcp:galley:write` + `mcp:inventory:write` | Cook and deduct ingredients from pantry. When cook-log-split is on, bridges to Manifest Prepared (no personal intake). Requires **both** scopes. |

### Manifest (meal plan)

| Tool | Scope | Description |
|------|-------|-------------|
| `propose_manifest_plan` | `mcp:read` | Compact week proposal from expiring items + `match_meals`. No writes; commit with `commit_manifest_plan`. |
| `add_meal_plan_entry` | `mcp:manifest:write` | Schedule a meal on a date and slot. |
| `commit_manifest_plan` | `mcp:manifest:write` | Commit a confirmed multi-entry schedule (optionally sync supply). Approval required; pass `confirm: true`. |
| `update_meal_plan_entry` | `mcp:manifest:write` | Patch date, slot, servings, or notes. Cannot edit consumed entries. |
| `remove_meal_plan_entry` | `mcp:manifest:write` | Remove a scheduled plan entry. |
| `cook_manifest_entries` | `mcp:manifest:write` + `mcp:inventory:write` | Shared Cook (Cargo + Prepared). Requires `nutrition-cook-log-split`. Never logs intake. |
| `consume_manifest_entries` | `mcp:manifest:write` + `mcp:inventory:write` | Legacy combined consume. Refused when cook-log-split is on — use cook then `log_manifest_intake`. Does not write personal intake (`logNutrition` is ignored). Requires **both** scopes. |

### Supply (shopping list)

| Tool | Scope | Description |
|------|-------|-------------|
| `add_supply_item` | `mcp:supply:write` | Add a line to Live Supply. Optional `listId` targets a saved list when the library is enabled. |
| `update_supply_item` | `mcp:supply:write` | Update name, quantity, or unit on a Live Supply line. |
| `remove_supply_item` | `mcp:supply:write` | Remove a supply list line. |
| `mark_supply_purchased_bulk` | `mcp:supply:write` | Mark one or many supply lines purchased / unpurchased. |
| `sync_supply_from_selected_meals` | `mcp:supply:write` | Rebuild list from meal plan + Galley selections (buy only the delta). Summary is net new, removed, and changed lines. |
| `complete_supply_list` | `mcp:supply:write` + `mcp:inventory:write` | Dock purchased items from **Live Supply** into pantry. Saved lists cannot be docked. Requires **both** scopes. **Requires `confirm: true`.** |
| `create_supply_list` | `mcp:supply:write` | Create a Saved or Template list. Flag-gated (`supply-multi-lists`). |
| `duplicate_supply_list` | `mcp:supply:write` | Duplicate a list into an independent copy. Flag-gated. |
| `archive_supply_list` | `mcp:supply:write` | Archive a Saved list. Flag-gated. |
| `transfer_supply_items` | `mcp:supply:write` | Copy or move items between lists. Flag-gated. |
| `manage_supply_staples` | `mcp:supply:write` | List, upsert, or delete kitchen staples. Flag-gated. |
| `save_receipt_as_supply_list` | `mcp:supply:write` | Save reviewed receipt lines as a Saved list. Flag-gated. No second AI credit. |

### Food diary (flag-gated)

Registered only when the matching nutrition flags are on (all need `nutrition-fast-log`). Personal to the caller. Not medical advice.

| Tool | Scope | Description |
|------|-------|-------------|
| `quote_food_log` | `mcp:nutrition:read` | Quote the credit cost of a food log. No writes, no model call. |
| `log_diary_food` | `mcp:nutrition:write` | Log one food the caller ate (typed macros or `savedFoodId`). `estimated` marks an AI estimate. Optional `fuelDate` (YYYY-MM-DD) logs on that Fuel day at local noon; optional `fuelTimeZone` (IANA) when Fuel has no zone yet. Approval required. No Cargo, Galley, Manifest, or Supply change. 0 credits. |
| `update_diary_food` | `mcp:nutrition:write` | Replace a food log (void + new row). Every edit returns a **new** `intakeId` plus `previousIntakeId`; use the new id next time. Pass `fuelDate` to move the entry to another day (see below). Approval required. 0 credits. |
| `void_diary_food` | `mcp:nutrition:write` | Void a food log. Destructive; approval required; **requires `confirm: true`**. |
| `save_diary_food_to_kitchen` | `mcp:nutrition:write` | Copy a food log into Cargo or Galley. Destructive for the shared kitchen; approval required; **requires `confirm: true`**. |
| `set_diary_layout` | `mcp:preferences:write` | Timeline or slots for the caller's day list. Approval required. |
| `list_saved_foods` | `mcp:nutrition:read` | Caller's saved foods (`nutrition-saved-food`). |
| `save_food` | `mcp:nutrition:write` | Save a food for the caller (`nutrition-saved-food`). Approval required. |
| `delete_saved_food` | `mcp:nutrition:write` | Delete a saved food (`nutrition-saved-food`). Approval required; **requires `confirm: true`**. |
| `lookup_food_barcode` | `mcp:nutrition:read` | USDA Branded Foods barcode lookup, exact `gtinUpc` only (`nutrition-barcode-diary`). No writes. |
| `propose_food_log` | `mcp:nutrition:write` | Draft a food log from a photo (`nutrition-photo-log`). A model call costs **2 credits**. Approval required. Commit with `log_diary_food` and `estimated: true`. |
| `get_health_export_status` | `mcp:nutrition:read` | Apple Health export switch state (`nutrition-health-export`). |
| `get_health_export_preview` | `mcp:nutrition:read` | Preview the Fuel logs that could export, plus a count of logs kept out (missing or implausible numbers, or older logs without a Health id) (`nutrition-health-export`). |
| `set_health_export` | `mcp:nutrition:write` | Turn Apple Health export on or off (`nutrition-health-export`). Approval required; **requires `confirm: true`**. |
| `clear_health_export` | `mcp:nutrition:write` | Ask the person's iPhone to remove every Apple Health sample Ration wrote for this account on its next sync; the device acknowledges when done (`nutrition-health-export`). Destructive; approval required; **requires `confirm: true`**. |

**Moving a Fuel entry to another day.** Call `update_diary_food` with the entry's `intakeId`, its food fields, and `fuelDate` (YYYY-MM-DD), without `occurredAt`. The entry moves to local noon on that day, the old day's free slot is released, and the new day's free limit applies: a full day returns `conflict` with `details.code: "fuel_daily_limit"` and `upgradeRequired: true` (Crew has no limit). Apple Health keeps the same sample and gets the new time on the next export. A replay with the same `operationKey` returns the same ids. Without `fuelDate` an edit stays on its stored day: pass the entry's `occurredAt` (or another time that day), because an omitted `occurredAt` means now and a different day returns `invalid_input` (`fuel_date_immutable`). A day that does not exist or a zone that is not IANA returns `invalid_input`; an unknown or already replaced `intakeId` returns `not_found`.

Server card: [`.well-known/mcp/server-card.json`](https://ration.mayutic.com/.well-known/mcp/server-card.json) · Full API reference: [docs/api](https://ration.mayutic.com/docs/api#mcp-tools)

---

## Pricing

| Tier | Includes |
|------|----------|
| **Free** | 35 pantry items · 15 recipes · 3 supply lists · 3 Fuel logs per day · MCP + OAuth · agent self-registration |
| **Crew Member** | Unlimited pantry/recipes · 25 supply lists · Unlimited Fuel logs · household invites · shared Manifest/Supply links · €2/month or €12/year |
| **Credit packs** (optional) | AI receipt scan, recipe import, meal generation, weekly AI plan in the **web app** — from €1 |

[MCP does not meter credits](https://ration.mayutic.com/blog/mcp-kitchen-assistant). Use the web app when you want hosted vision/AI features.

---

## MCP server details

| Field | Value |
|-------|-------|
| **Name** | Ration |
| **Endpoint** | `https://mcp.ration.mayutic.com/mcp` |
| **Transport** | Streamable HTTP (OAuth 2.1) |
| **Category** | Productivity |
| **Source** | [gitlab.com/mayutic/ration/application](https://gitlab.com/mayutic/ration/application) |
| **Homepage** | [ration.mayutic.com](https://ration.mayutic.com) |
| **Listing doc** | [ration.mayutic.com/mcp.md](https://ration.mayutic.com/mcp.md) |
| **Built by** | [Mayutic](https://www.mayutic.com) |

### mcpservers.org submission (copy-paste)

- **Server name:** Ration
- **Short description:** AI-native kitchen MCP — pantry inventory, cook-from-stock recipes, meal plans, and shopping lists with OAuth and 35+ tools. Free to start.
- **Link:** https://ration.mayutic.com/mcp.md
- **Category:** Productivity

---

## Learn more

- [Homepage & signup](https://ration.mayutic.com)
- [Connect your agent](https://ration.mayutic.com/connect)
- [Your Kitchen Has an API (blog)](https://ration.mayutic.com/blog/mcp-kitchen-assistant)
- [The Pantry Data Problem (blog)](https://ration.mayutic.com/blog/pantry-data-problem)
- [REST API v1](https://ration.mayutic.com/docs/api)

---

*Ration — manage your kitchen through your AI agent.*
