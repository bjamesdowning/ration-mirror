# What is Ration?

Ration is a **pantry and meal operations** app: you track what you have (**Cargo**), keep recipes (**Galley**), plan the week (**Manifest**), and build a shopping list (**Supply**). Optional **AI** helps with receipt scanning, recipe ideas, weekly planning, and importing recipes from the web.

Under the hood, those four surfaces share one **household data model**. You can work the same kitchen from the **web and mobile apps**, from **Ask Ration** (in-app Copilot), or from external AI tools over **MCP** (Model Context Protocol). Ration is built to be your **kitchen memory for AI**—inventory, meals, plan, and supply stay consistent no matter which modality you use.

## Who it is for

- Households and small teams who want **one shared inventory** and coordinated meal planning.
- People who want **less waste** (expiry awareness, cook-from-pantry matching) and **faster shopping** (supply list synced from the plan).
- Anyone who wants a **durable kitchen memory** their AI assistants can read and update—not a separate chat-only pantry that drifts from the app.

## Where it runs

Ration is hosted on **Cloudflare** (global edge). The product website and app are served over HTTPS. Your data is stored in managed databases and object storage tied to your **organization** (group), not scattered across anonymous devices.

## How you control it

Same org-scoped Cargo, Galley, Manifest, and Supply—different ways in:

| Modality | What it is | Typical use |
|----------|------------|-------------|
| **Web / iOS app** | Full hub UI | Day-to-day pantry ops, planning, shopping, credit-gated AI features |
| **Ask Ration (Copilot)** | First-party in-app chat | Natural-language help against your **live** kitchen; searches this guide and runs the same org tools |
| **MCP** | Protocol for external agents (Cursor, Claude Desktop, ChatGPT desktop, and other MCP clients) | Drive the kitchen from your own AI tools via OAuth or API keys |

Ask Ration and MCP share the same organization-scoped tool logic. Copilot authenticates as the signed-in user; MCP uses delegated OAuth or organization API keys. Details: *Ask Ration vs reading the guide* and *MCP overview*.

## What makes Ration different

- **One data model, many modalities** — app, Copilot, and MCP all operate on the same household kitchen; you are not maintaining parallel pantries.
- **Semantic matching** links recipe ingredient names to pantry items even when wording differs (e.g. “whole milk 2%” vs “2% milk”).
- **Credits** pay for certain AI operations (including Ask Ration usage); they belong to the **whole group** so any member can use them fairly. MCP tool calls themselves do **not** consume AI credits—see *AI credits explained* and *MCP overview*.
- **Crew Member** subscription unlocks higher limits, invitations, and sharing—see the subscription article in this hub.

If anything here conflicts with what you see in the app, **trust the app** and contact support.
