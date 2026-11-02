---
title: "How to use Ration with Grok Bot (or any AI agent)"
description: "Connect Ration's live kitchen MCP to Grok Bot, Claude, Cursor or ChatGPT, then ask for today's meal plan, shopping lists and more — with a real conversation example."
date: 2026-11-02
dateModified: 2026-11-02
authorName: "Ration"
image: "/static/og/use-ration-with-grok-bot.svg"
tags:
  - Grok Bot
  - MCP
  - AI agent
  - meal planning
  - Model Context Protocol
  - shopping list
---

**Ration is a live kitchen system for web and iOS: food stock (Cargo), Meals (Galley), weekly meal plans (Manifest), shopping lists (Supply), multiple kitchens, and private Daily Fuel macros from the Meals you cook. It also runs a production MCP server, so AI assistants such as Grok Bot, Claude, Cursor and ChatGPT can read and update that same kitchen.**

Most kitchen apps stay inside their own screen. Ration keeps the screen, and it also speaks [Model Context Protocol](https://modelcontextprotocol.io/) (MCP). Once your assistant is connected, a question like "what's for dinner?" hits real Manifest data — not a note you copied by hand.

This post shows a real Grok Bot conversation that mixes today's meal plan with a grocery delivery window, then covers how to connect and what agents can do. For a longer connect walkthrough with more pantry prompts, see [Your Kitchen Has an API Now](/blog/mcp-kitchen-assistant).

## A real conversation

Here is a Grok Bot chat asking Ration for today's plan and a grocery delivery time:

![Grok Bot answering a question about today's Ration meal plan and a Tesco grocery delivery window in Dublin](/static/og/use-ration-with-grok-bot.svg)

> **You:** What's my meal plan from Ration today? And when are my groceries getting delivered?
>
> **Grok Bot:** Today's Ration plan (Irish time):
> - **Breakfast:** Overnight oats (3 servings). These need soaking the night before, and your Tesco groceries aren't here yet, so you may want to use whatever you've got for breakfast.
> - **Lunch:** Nothing planned.
> - **Snack:** A snack box.
> - **Dinner:** Sheet pan chicken fajitas (4 servings). One tray of chicken, peppers and onions, then wraps.
>
> Your Tesco delivery is **3–5pm today** in Dublin. The fajita ingredients come in that delivery, so dinner should be fine.

Two systems, one answer. Ration supplied the Manifest slots. The delivery window came from another connected tool (order tracking). That is the point of MCP: the assistant stitches live kitchen state with the rest of your day.


## Logging macros from outside the kitchen

Agents can also write Daily Fuel (personal intake) when you grant nutrition scopes. Here Grok Bot looks up a Starbucks caramel flat white, logs accurate macros into Ration, and shows today's running total:

![Grok Bot looking up Starbucks caramel flat white macros, logging them into Ration Daily Fuel, and showing today's calorie total](/static/og/use-ration-with-grok-bot-macros.svg)

> **You:** I just had a caramel flat white from Starbucks, can you check Ration and update the current provision with accurate macros, and consume it so I can track my macros for it
>
> **Grok Bot:** Looking up the Starbucks caramel flat white macros and logging it in Ration now.
>
> Logged. Your Starbucks caramel flat white is in today's Ration tracking as about **116 kcal, 4g protein, 16g carbs and 4g fat.**
>
> I treated it as a Short (the small cup Starbucks Ireland lists) with whole milk, plus 2 pumps of caramel syrup. The milk and coffee come from Starbucks Ireland's nutrition guide; the syrup is an estimate of about 20 kcal per pump.
>
> Today's total so far is about 616 kcal across that coffee and the meal replacement shake you logged earlier.

Ration stored the intake on your personal Daily Fuel log. The Starbucks numbers came from a public nutrition guide the assistant cited; Ration did not invent them. This is tracking, not medical advice.

## How to connect

Add Ration as a remote MCP server using this public URL:

`https://mcp.ration.mayutic.com/mcp`

Compatible clients connect with **OAuth 2.1 and Dynamic Client Registration**. The client registers itself, then opens a browser so you can sign in, pick a household and approve scopes. You should not paste API keys or bearer tokens into an agent chat.

1. In your AI client, add a remote MCP server at `https://mcp.ration.mayutic.com/mcp`.
2. Complete browser sign-in, select your household and approve scopes.
3. Ask something simple, such as "What's on my meal plan today?"

One-click deep links live on the [connect page](https://ration.mayutic.com/connect). Client-specific tips and more example prompts are in [Your Kitchen Has an API Now](/blog/mcp-kitchen-assistant).

## What agents can do in Ration

Once connected, the assistant works on the same Cargo, Galley, Manifest and Supply data you see in the app:

| Job | Example ask |
|---|---|
| Today's plan | "What's on Manifest today?" |
| Stock check | "Do we have enough eggs?" |
| Cookability | "What can I make without shopping?" |
| Shopping | "Add missing fajita bits to Supply" |
| Multiple lists | "Put party drinks on a separate list" |
| Log a haul | "I bought spinach, feta and mince" |
| Expiry rescue | "What's going off this week?" |

**Not on MCP:** billed AI jobs such as vision receipt scan and AI Meal generation stay in the Ration UI and use credits. External agents bring their own model and call Ration's structured tools instead. Copilot is Ration's built-in chat on the same kitchen; MCP is how outside assistants join that kitchen.

## Why this matters for AI search

Assistants that cite sources need a clear product definition, a public MCP URL, and examples of questions that resolve against live data. This post is written so tools like ChatGPT, Perplexity and Google AI Overviews can answer:

- What is Ration?
- How do I connect an AI agent to Ration?
- Can Grok Bot read my meal plan?
- Does Ration support MCP and Dynamic Client Registration?

Short answers sit in the FAQ below and in Ration's [`llms.txt`](https://ration.mayutic.com/llms.txt).

## FAQ

**What is Ration?**

Ration is a live kitchen system for web and iOS covering food stock (Cargo), Meals (Galley), weekly meal plans (Manifest), shopping lists (Supply), multiple kitchens and private Daily Fuel macros from the Meals you cook. It exposes a production MCP server so AI assistants can operate that kitchen with structured tools.

**How do I connect Grok Bot to Ration?**

Add `https://mcp.ration.mayutic.com/mcp` as a remote MCP server in Grok Bot. Complete browser OAuth when prompted — Dynamic Client Registration handles the client setup. Then ask about your meal plan, Cargo or Supply Lists.

**Does connecting share my whole account?**

You approve specific MCP scopes for a chosen household. You can revoke the connection from your Ration settings. Agents only see kitchens you grant.

**Can the agent change my meal plan and shopping list?**

Yes, when you grant write scopes. It can update Manifest entries, Cargo items and Supply Lists. Destructive actions typically ask for confirmation inside the tool flow.

**Is grocery delivery part of Ration?**

No. In the example above, Ration provided the meal plan; the Tesco delivery window came from another connected tool. Agents combine sources in one reply.

**Can an agent log macros into Ration?**

Yes, when you grant nutrition write scopes. The assistant can log personal intake (Daily Fuel) for things you ate outside a planned Meal, then show today's running totals. Not medical advice.

**How is this different from Ration Copilot?**

Copilot is the built-in assistant inside Ration. MCP connects external clients such as Grok Bot, Claude, Cursor and ChatGPT to the same live Cargo, Galley, Manifest and Supply data.

---

*Written by Grok. Curated and reviewed by the Ration team.*
