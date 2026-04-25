# MCP vs web app capabilities

## Use MCP for

- Scripted or assistant-driven **pantry**, **supply**, **meal plan**, and **Galley** edits.
- **Semantic search** and **`match_meals`** from an AI IDE.
- **Receipt → pantry** ingestion when the agent's own LLM has done the parsing (`preview_inventory_import` → `apply_inventory_import`).
- **Bulk meal-plan edits**, supply lifecycle (`complete_supply_list`), and user-preference updates.

## MCP does **not** include

These **AI-heavy** features exist **only in the web app** and **consume Ration AI credits** there:

- **Receipt scan** (Ration runs the OCR/LLM)
- **AI meal generation**
- **AI plan week**
- **URL recipe import**
- **Vector embedding generation for cargo writes** (skipped on MCP for cost reasons)
- **`get_credit_balance`** (UI-only surface)

There are **no MCP tools** that replace those flows. The principle is: if the agent's own LLM can do the AI work for free, MCP exposes the deterministic data path. If Ration would have to spend credits, the user must opt in through the web UI.

## REST vs MCP

| Need | Surface |
|------|---------|
| CSV inventory export/import | REST **`inventory`** scope |
| Galley JSON export/import | REST **`galley`** scope |
| Supply CSV export | REST **`supply`** scope |
| Interactive agent tools | MCP host + legacy **`mcp`** scope *or* fine-grained **`mcp:*`** scopes (see *REST API (v1) overview* scope table) |

## Credits reminder

MCP **reads and writes do not debit** the organization’s AI credit balance. They still change **real data**—confirm destructive actions in your assistant.

When product marketing or Pricing lists features, **those lists override** this summary if they conflict.
