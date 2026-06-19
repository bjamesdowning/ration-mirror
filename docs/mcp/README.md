# Ration MCP Server

> **AI-native kitchen management for your assistant** — live pantry inventory, cook-from-stock recipes, weekly meal plans, and shopping lists your agent can read and update through MCP.

**Homepage:** [ration.mayutic.com](https://ration.mayutic.com) · **Connect:** [ration.mayutic.com/connect](https://ration.mayutic.com/connect) · **Start free** — no credit card required.

---

## The complete kitchen loop for your AI

Most kitchen apps make *you* maintain the spreadsheet. Ration closes the loop:

**Cargo** (pantry) → **Galley** (recipes) → **Manifest** (meal plan) → **Supply** (shopping list) → dock back into Cargo.

Your MCP client operates the same data you see in the web app — not a shadow copy. Semantic matching links recipe ingredients to pantry items even when names differ (`"2% milk"` vs `"whole milk 2%"`). Expiry-aware tools help you cook what you have before it spoils.

**Free to start:** 35 pantry items, 15 recipes, 3 supply lists, full MCP access. Upgrade to **Crew Member** ($2/month or $12/year) for unlimited capacity, household sharing, and invite links.

---

## Same prompt, better answer

### Without Ration

> "What can I make tonight?"

Your assistant guesses. It does not know what is in your fridge, what expired yesterday, or what is on Thursday's plan.

### With Ration MCP

> "What can I cook tonight with what's in Cargo?"

`match_meals` returns recipes ranked by what you can actually cook — with gaps listed for anything missing. Ask follow-ups: add missing items to Supply, schedule a meal on Manifest, deduct ingredients after you cook.

---

## What you can say

| Prompt | What happens |
|--------|----------------|
| "List my pantry and what's expiring this week." | `list_inventory` + `get_expiring_items` |
| "What meals can I make with what we have?" | `match_meals` (strict or partial matches) |
| "Plan dinners through Friday and add anything missing to the list." | `get_meal_plan` → `bulk_add_meal_plan_entries` → `sync_supply_from_selected_meals` |
| "We cooked lentil soup for four — update inventory." | `consume_meal` deducts ingredients via semantic matching |
| "Add eggs and butter to the shopping list." | `add_supply_item` |
| "I bought everything on the list — mark it purchased." | `mark_supply_purchased` |
| "Parse this receipt and add new items to Cargo." | Agent parses text → `preview_inventory_import` → `apply_inventory_import` (no Ration AI credits) |

MCP tool calls are **deterministic and do not consume Ration credits**. Receipt parsing runs in *your* LLM; Ration ingests structured items. Visual scan and AI meal generation in the web app use optional credit packs.

---

## Why Ration MCP is different

- **Closed-loop kitchen ops** — inventory, recipes, plan, and shop list in one system (not four apps).
- **35+ MCP tools** — granular OAuth scopes (`mcp:read`, `mcp:inventory:write`, `mcp:galley:write`, `mcp:manifest:write`, `mcp:supply:write`).
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

### Autonomous agents

Read [auth.md](https://ration.mayutic.com/auth.md) for anonymous agent registration and human claim via OTP.

---

## Tool groups (summary)

| Group | Tools | Purpose |
|-------|-------|---------|
| **Inventory** | `list_inventory`, `search_ingredients`, `get_expiring_items`, `add_cargo_item`, `preview_inventory_import`, `apply_inventory_import`, … | Live pantry (Cargo) |
| **Galley** | `list_meals`, `match_meals`, `create_meal`, `consume_meal`, … | Recipes and cook-from-stock |
| **Manifest** | `get_meal_plan`, `add_meal_plan_entry`, `bulk_add_meal_plan_entries`, … | Weekly meal calendar |
| **Supply** | `get_supply_list`, `sync_supply_from_selected_meals`, `mark_supply_purchased`, … | Shopping list delta |
| **Account** | `get_context`, `get_user_preferences`, `update_user_preferences` | Allergens, units, alerts |

Full reference: [MCP tools in API docs](https://ration.mayutic.com/docs/api#mcp-tools) · Server card: [`.well-known/mcp/server-card.json`](https://ration.mayutic.com/.well-known/mcp/server-card.json)

Destructive actions (`remove_cargo_item`, `delete_meal`, `clear_active_meals`) require `confirm: true`.

---

## Pricing

| Tier | Includes |
|------|----------|
| **Free** | 35 pantry items · 15 recipes · 3 supply lists · MCP + OAuth · agent self-registration |
| **Crew Member** | Unlimited capacity · household invites · shared Manifest/Supply links · $2/mo or $12/yr |
| **Credit packs** (optional) | AI receipt scan, recipe import, meal generation, weekly AI plan in the **web app** — from $1 |

[MCP does not meter credits](https://ration.mayutic.com/blog/mcp-kitchen-assistant). Use the web app when you want hosted vision/AI features.

---

## MCP server details

| Field | Value |
|-------|-------|
| **Name** | Ration |
| **Endpoint** | `https://mcp.ration.mayutic.com/mcp` |
| **Transport** | Streamable HTTP (OAuth 2.1) |
| **Category** | Productivity |
| **Source** | [ration.mayutic.com](https://ration.mayutic.com) |
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
