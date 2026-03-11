---
title: "Your Kitchen Has an API Now"
description: "How to connect Ration to Claude, Cursor, and any MCP client — with real prompts, real outputs, and workflows that make it worth setting up."
date: 2026-03-10
dateModified: 2026-03-11
authorName: "Billy Downing"
authorUrl: "https://linkedin.com/in/billy-downing"
image: "/static/ration-logo.svg"
tags:
  - MCP
  - AI assistant
  - pantry management
  - meal planning
  - kitchen API
---

Most kitchen apps are designed around tapping and swiping. Ration is too — but it also speaks a language that AI assistants understand natively.

Through the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP), you can manage your entire pantry, meal plan, and shopping list from [Ration](https://ration.mayutic.com) inside Claude, Cursor, or any MCP-compatible client. No custom integrations. No webhooks. No glue code.

This post walks through what that actually looks like in practice, and why it turns pantry management, meal planning, and shopping list workflows into something an AI assistant can actually help with.

---

## What is MCP?

MCP is an open protocol that lets AI assistants call tools on external services. Think of it like giving Claude a set of buttons it can press on your behalf:

- "Search the pantry"
- "Add eggs to the shopping list"
- "What meals can I make tonight?"

Ration runs a dedicated MCP server at `mcp.ration.mayutic.com`. Once connected, your AI assistant reads and writes the same data you see in the Ration dashboard.

It's not a separate system or a sync. Same pantry. Same recipes. Same meal plan.

---

## Getting connected

You need two things: a Ration account and an API key with the `mcp` scope. Generate one from **Settings → Developer → API Keys** in the dashboard.

### Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ration": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.ration.mayutic.com/mcp",
        "--header",
        "Authorization:${RATION_AUTH_HEADER}"
      ],
      "env": {
        "RATION_AUTH_HEADER": "Bearer rtn_live_your_key_here"
      }
    }
  }
}
```

### Cursor

Add the same server block under your MCP settings panel. Once connected, the tools show up automatically. No SDK to install, nothing to build. If you want a public example of Ration's kitchen tooling before connecting MCP, the [unit converter](https://ration.mayutic.com/tools/unit-converter) shows the same measurement system the app uses internally.

---

## Browsing your pantry

The simplest starting point. Claude calls `list_inventory` and returns what you have on hand.

> **You:** What do I have in my pantry right now?

Claude pulls your full cargo list — names, quantities, units, and domains (food, household, alcohol).

You can narrow it:

> **You:** What food items do I have? Skip household stuff.

> **Claude:** You have 47 food items. Here are some highlights:
> - Chicken breast — 1.2 kg
> - Basmati rice — 2 kg
> - Olive oil — 750 ml
> - Eggs — 12
> - Cheddar cheese — 400 g
> - Garlic — 1 head

---

## Logging a grocery haul

After a shop, instead of opening the app and tapping through entries one by one, just tell Claude what you bought.

> **You:** I picked up 500g of mince, a bag of spinach, 2 cans of chopped tomatoes, and a block of feta.

Claude calls `add_cargo_item` for each one, picking sensible units and quantities. Ration merges quantities for existing items automatically.

> **Claude:** Done. Added to your pantry:
> - Beef mince — 500 g (new)
> - Spinach — 1 bag (new)
> - Chopped tomatoes — 2 cans (merged with existing — now 4 total)
> - Feta cheese — 1 block (new)

No duplicate entries. The MCP tool just passes items through and Ration resolves the rest.

---

## Finding what you can cook

This is the workflow that makes the whole setup worth it. Claude calls `match_meals`, which cross-references your pantry against your saved recipes.

> **You:** What meals can I make with what I have? I don't want to go to the shop.

Two modes are available:

- **Strict mode** — only meals where every ingredient is covered
- **Delta mode** — partial matches, with a clear list of what's missing

> **Claude:**
>
> **Fully cookable:**
> - Garlic Fried Rice — all ingredients available
> - Greek Salad — all ingredients available
> - Simple Omelette — all ingredients available
>
> **Almost there (one item away):**
> - Spaghetti Bolognese — missing: spaghetti (500 g)
> - Spinach & Feta Pie — missing: filo pastry (1 pack)

That "almost there" list is often more useful than the strict one. You know exactly what to grab if you pass a shop.

---

## Rescuing expiring food

Food waste is the enemy. Claude can check what needs attention before it's too late.

> **You:** Anything expiring in the next 3 days?

> **Claude:** 3 items expiring soon:
> - Chicken breast (1.2 kg) — expires March 12
> - Spinach (1 bag) — expires March 11
> - Greek yogurt (500 ml) — expires March 13

Then follow it up naturally:

> **You:** Can I make anything with the chicken and spinach before they go off?

Claude runs `match_meals` filtered against those ingredients and suggests options. Multi-step reasoning that would take several taps in any UI happens in a single conversation.

---

## Planning meals

Once you've picked meals, slotting them into the calendar is a single sentence.

> **You:** Put the Garlic Fried Rice on Wednesday dinner and the Greek Salad on Thursday lunch.

Claude calls `add_meal_plan_entry` twice — once per slot. The meals appear in your Manifest calendar immediately.

---

## Building a shopping list

Your supply list understands domains. Claude assigns them correctly.

> **You:** I need pasta, tinfoil, and a bottle of red wine for the weekend.

Claude calls `add_supply_item` three times: pasta as food, tinfoil as household, wine as alcohol. Each lands on your active supply list, visible to anyone you've shared it with.

Later, at the shop:

> **You:** I got the pasta and the wine.

Claude marks both as purchased. The tinfoil stays unchecked.

---

## Editing recipes

Recipes evolve. Maybe you tried a variation and want to save it.

> **You:** In my Spaghetti Bolognese recipe, swap the beef mince for turkey mince and add a teaspoon of smoked paprika.

Claude calls `update_meal` with the modified ingredient list. The recipe updates in your Galley instantly — same directions, same servings, just the ingredients you changed.

---

## The compound effect

Any single interaction saves a few taps. The real value is in chaining them across pantry tracking, meal planning, and shopping list management.

A full session might look like this:

```text
1. "What's expiring?"        → chicken, spinach, yogurt
2. "What can I make?"        → chicken & spinach curry
3. "Put it on Tuesday dinner" → done
4. "What am I missing?"      → coconut milk and naan
5. "Add those to my list"    → done
```

Five prompts. Zero app-switching.

You've rescued expiring food, planned a meal, and built a shopping list. That's the compound value MCP enables — not replacing the Ration UI, but giving you another way in when conversation is faster.

---

## Current limitations

### Not available via MCP

AI-powered features like receipt scanning, meal generation, and weekly auto-planning are triggered from the dashboard and use Ration's credit system. They aren't exposed through MCP yet.

### What does work

**Semantic search** (`search_ingredients`) is fully available. It uses the same vector embeddings as the dashboard — search for "tomato" and you'll find "chopped tomatoes," "cherry tomatoes," and "tomato passata."

### Rate limits

Reads are capped at 30 per minute. Writes at 15 per minute. That's plenty for conversational use. The limits exist to prevent runaway automation from draining resources, not to restrict normal workflows.

---

## Who is this for?

Anyone who already uses Claude or Cursor and wants faster pantry tracking, meal planning, and shopping list management.

The setup takes two minutes. After that, your kitchen becomes part of your existing AI workflow instead of a separate app you have to remember to open.

It's especially useful if you:

- **Meal prep on Sundays** — plan multiple meals and build a shopping list in one conversation
- **Track what's in the freezer** — ask Claude instead of digging through drawers
- **Share a shopping list with a partner** — items you add through Claude appear on their phone instantly
- **Batch-log groceries** — rattle off ten items in one message instead of tapping through a form

---

*Written by [Opus](https://www.anthropic.com/claude). Curated and reviewed by [Billy Downing](https://linkedin.com/in/billy-downing).*
