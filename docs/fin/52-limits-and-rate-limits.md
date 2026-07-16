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

During a **KV outage**, AI and search-spend throttles **fail closed** (requests are denied briefly) so platform spend cannot runaway. Ordinary read/mutation limits may still fail open for availability.

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

## Meal match candidate vs result limits

Meal matching scores up to **`MEAL_MATCH_CANDIDATE_CAP` (200)** meals (most recently updated) on every surface — web API, web Galley, iOS Galley, mobile match API, MCP, and hub. That is separate from how many matches a UI **shows**: web and iOS Galley request result `limit = 100`; hub widgets show ~6 from the same scored pool.

For “why was I blocked?”, include **which action** (hub button vs API vs MCP) and **approximate time** when contacting support.
