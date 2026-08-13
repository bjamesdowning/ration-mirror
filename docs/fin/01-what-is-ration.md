# What is Ration?

Ration is a **pantry, meal, and macro planner**: one live kitchen loop. You track what you have (**Cargo**), keep the recipes you actually cook (**Galley**), plan the week (**Manifest**), and shop only the gaps (**Supply**). Optional **Macro Tracking** (Daily Fuel) logs **your** calories and macros from those same meals — a planning aid, not medical advice, and private even in a shared kitchen.

Optional **AI** helps with receipt scanning, recipe ideas, weekly planning, and importing recipes from a website, TikTok / Instagram / YouTube, or a photo. On iPhone the App Store listing is **Ration: Meal & Macro Planner**; the home-screen name stays **Ration**.

Under the hood, the four kitchen surfaces share one **household data model**. You can work the same kitchen from the **web and iOS apps**, from **Ask Ration** (in-app Copilot), or from external AI tools over **MCP** (Model Context Protocol). Ration is built to be your **kitchen memory for AI**—inventory, meals, plan, supply, and (when you opt in) personal Daily Fuel stay consistent no matter which modality you use.

## Who it is for

- Households and small teams who want **one shared inventory** and coordinated meal planning.
- People who want **less waste** (expiry awareness, cook-from-pantry matching) and **faster shopping** (supply list synced from the plan).
- Anyone who wants **macros from dinner**, not a second food diary that never sees the recipe they cooked.
- Anyone who wants a **durable kitchen memory** their AI assistants can read and update—not a separate chat-only pantry that drifts from the app.

## Where it runs

Ration is hosted on **Cloudflare** (global edge). The product website and app are served over HTTPS. Your data is stored in managed databases and object storage tied to your **organization** (group), not scattered across anonymous devices. Personal calorie and macro logs stay on **your** account.

## How you control it

Same org-scoped Cargo, Galley, Manifest, and Supply—different ways in. Daily Fuel is a **personal overlay** on that kitchen, not a sixth shared surface.

| Modality | What it is | Typical use |
|----------|------------|-------------|
| **Web / iOS app** | Full hub UI | Day-to-day pantry ops, planning, shopping, optional macros, credit-gated AI features |
| **Ask Ration (Copilot)** | First-party in-app chat | Natural-language help against your **live** kitchen; searches this guide and runs the same org tools |
| **MCP** | Protocol for external agents (Cursor, Claude Desktop, ChatGPT desktop, and other MCP clients) | Drive the kitchen from your own AI tools via OAuth or API keys |

Ask Ration and MCP share the same organization-scoped tool logic. Copilot authenticates as the signed-in user; MCP uses delegated OAuth or organization API keys. Details: *Ask Ration vs reading the guide* and *MCP overview*.

## What makes Ration different

- **One data model, many modalities** — app, Copilot, and MCP all operate on the same household kitchen; you are not maintaining parallel pantries.
- **Cook vs log** — cooking deducts shared stock; logging a serving is private Macro Tracking. Housemates never see your kcal.
- **Semantic matching** links recipe ingredient names to pantry items even when wording differs (e.g. “whole milk 2%” vs “2% milk”).
- **Credits** pay for certain AI operations (including Ask Ration usage); they belong to the **whole group** so any member can use them fairly. MCP tool calls themselves do **not** consume AI credits—see *AI credits explained* and *MCP overview*.
- **Crew Member** subscription unlocks higher limits, invitations, and sharing—see the subscription article in this hub.

If anything here conflicts with what you see in the app, **trust the app** and contact support.
