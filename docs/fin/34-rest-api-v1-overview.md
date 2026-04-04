# REST API (v1) overview

## Authentication

Send your API key as either:

- `Authorization: Bearer rtn_live_...`, or  
- `X-Api-Key: rtn_live_...`

Keys are created in **Hub → Settings**. Only the **hash** is stored server-side; the plaintext key is shown **once** at creation.

## Scopes

| Scope | Capability |
|-------|------------|
| `inventory` | Export / import cargo (CSV) |
| `galley` | Export / import recipe library (JSON manifest) |
| `supply` | Export active supply list (CSV) |
| `mcp` | MCP Worker tools (separate host) |

## Typical endpoints

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

## Security

Rotate keys if leaked. Use **minimum scopes** for each integration.

For interactive AI assistants, prefer **MCP** with the `mcp` scope; use REST for **bulk file** workflows.
