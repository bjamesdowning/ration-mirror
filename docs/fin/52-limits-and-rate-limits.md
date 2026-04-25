# Limits and rate limits

## Tier capacity

**Free** organizations face caps on inventory count, meal count, supply lists, and owned groups. **Crew Member** raises or removes those caps and enables invitations and sharing. Limits follow the **owner’s** subscription—see *Subscription tiers*.

## AI credit costs

Each AI operation debits a fixed number of **credits** from the org—see *AI credits explained*.

## Web API rate limits (examples)

Ration throttles expensive or abuse-prone routes **per user** or **per IP** over sliding windows. Examples from product design include:

| Area | Purpose |
|------|---------|
| Scan, meal generate, import, plan week | Protect AI spend |
| Search | Protect database |
| Checkout, group create | Reduce spam |
| Auth endpoints | Reduce brute force |
| Public shared lists | Reduce anonymous abuse |
| REST import/export | Per-org throttles |

Exact numbers can change; when the API returns a **rate limit** response, **wait and retry** slower.

## MCP rate limits

**Per organization** (shared by all keys for that org):

| Bucket | Typical max per 60s |
|--------|---------------------|
| `mcp_list` | 30 |
| `mcp_search` | 20 |
| `mcp_write` | 15 |
| `mcp_supply_sync` | 8 |

**Per API key** (write tools only):

| Bucket | Typical max per 60s |
|--------|---------------------|
| `mcp_write_per_key` | 15 |

Heavy supply rebuilds use `mcp_supply_sync`, separate from ordinary `mcp_write`. Exact numbers can change; MCP tool responses may include structured rate-limit hints in the JSON envelope when limited.

## CSV / JSON import caps

Programmatic imports enforce **row counts** and **payload sizes**—see *REST API (v1) overview*.

For “why was I blocked?”, include **which action** (hub button vs API vs MCP) and **approximate time** when contacting support.
