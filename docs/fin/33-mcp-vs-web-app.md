# MCP vs web app capabilities

## Use MCP for

- Scripted or assistant-driven **pantry**, **supply**, **meal plan**, and **Galley** edits.
- **Semantic search** and **match_meals** from an AI IDE.
- **Reading** credit balance (without spending credits).

## MCP does **not** include

These **AI-heavy** features exist **only in the web app** and **consume AI credits** there:

- **Receipt scan**
- **AI meal generation**
- **AI plan week**
- **URL recipe import**

There are **no MCP tools** that replace those flows. Use **Hub** (and a normal browser session) for them.

## REST vs MCP

| Need | Surface |
|------|---------|
| CSV inventory export/import | REST **`inventory`** scope |
| Galley JSON export/import | REST **`galley`** scope |
| Supply CSV export | REST **`supply`** scope |
| Interactive agent tools | MCP **`mcp`** scope |

## Credits reminder

MCP **reads and writes do not debit** the organization’s AI credit balance. They still change **real data**—confirm destructive actions in your assistant.

When product marketing or Pricing lists features, **those lists override** this summary if they conflict.
