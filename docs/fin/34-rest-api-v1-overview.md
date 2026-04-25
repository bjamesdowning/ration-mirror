# REST API (v1) overview

## Authentication

Send your API key as either:

- `Authorization: Bearer rtn_live_...`, or  
- `X-Api-Key: rtn_live_...`

Keys are created in **Hub → Settings**. Only the **hash** is stored server-side; the plaintext key is shown **once** at creation.

## Scopes

REST v1 and MCP use the **same** key format; scopes are checked per surface.

### REST (this host: `ration.mayutic.com` or your app origin)

| Scope | Capability |
|-------|------------|
| `inventory` | Export / import cargo (CSV) |
| `galley` | Export / import recipe library (JSON manifest) |
| `supply` | Export active supply list (CSV) |

### MCP (separate host: `mcp.ration.mayutic.com`)

| Scope | Capability |
|-------|------------|
| `mcp` | **Legacy / full access** — all MCP tools (same as enabling every row below) |
| `mcp:read` | Read-only MCP tools (inventory, meals, plan, supply list, preferences, import preview) |
| `mcp:inventory:write` | Pantry writes + receipt-style import apply (`apply_inventory_import`, `import_inventory_csv`, cargo CRUD) |
| `mcp:galley:write` | Recipe and meal-selection writes (`create_meal`, `update_meal`, `delete_meal`, `consume_meal`, `toggle_meal_active`, `clear_active_meals`) |
| `mcp:manifest:write` | Meal plan entry writes (add / bulk add / update / remove) |
| `mcp:supply:write` | Shopping list writes + sync + `complete_supply_list` |
| `mcp:preferences:write` | `update_user_preferences` only |

Use **narrow scopes** for integrations that only need one job (for example `mcp:read` + `mcp:inventory:write` for a receipt-import agent). The full tool matrix lives in *MCP tools reference*.

**MCP responses** are JSON **envelopes** (`ok`, `tool`, `data` or `error`) in the MCP `text` content — not raw REST JSON.

## Typical endpoints (REST v1)

| Method | Path | Scope | Notes |
|--------|------|-------|-------|
| GET | `/api/v1/inventory/export` | inventory | CSV download |
| POST | `/api/v1/inventory/import` | inventory | CSV body; row limits apply |
| GET | `/api/v1/galley/export` | galley | JSON manifest |
| POST | `/api/v1/galley/import` | galley | JSON body; size limits apply |
| GET | `/api/v1/supply/export` | supply | CSV download |

## Limits

Imports enforce **maximum row counts** and **payload sizes** (on the order of hundreds of rows and ~1MB for JSON—see errors returned by the API). Split large migrations into batches.

## Rate limits

Exports/imports are **throttled per organization** to prevent abuse. If you receive a retry-style response, slow down and retry later.

MCP has **separate** buckets (per org and per key for writes) — see *Limits and rate limits* and *MCP tools reference*.

## Security

Rotate keys if leaked. Use **minimum scopes** for each integration.

- **Bulk file** workflows (CSV/JSON over HTTP) → REST with `inventory` / `galley` / `supply` as needed.  
- **Interactive assistants** (Cursor, Claude) → MCP on `mcp.ration.mayutic.com` with `mcp` **or** the smallest set of `mcp:*` scopes that covers the tools you need.
