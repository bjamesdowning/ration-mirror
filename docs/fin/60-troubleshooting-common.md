# Common troubleshooting

## “Not enough credits”

- Check **Hub → Pricing** for the organization balance.
- Remember credits are **per organization**—switching groups changes which balance applies.
- **MCP** does not spend AI credits; if only MCP fails, see *Connecting to MCP* and rate limits.

## Wrong pantry or missing meals

- Confirm the **active group** in the hub switcher.
- Data does **not** merge across organizations.

## Cannot invite members or share links

- **Invitations** and **public share** for supply/manifest require **Crew Member** (and correct role).
- Limits follow the **organization owner’s** tier—see *Subscription tiers*.

## Receipt scan stuck or failed

- Wait for **processing**; large images or model load can delay results.
- On **failure**, credits should **refund**—refresh balance; if not, contact support with time and org.

## URL import “duplicate”

That recipe **URL was already imported** for this org. Open the existing meal or edit manually.

## MCP “connection closed” or 401

- Header must be **`Authorization: Bearer rtn_live_...`** (include `Bearer `).
- Key must include the legacy **`mcp`** scope **or** at least one **`mcp:`** scope (for example `mcp:read`). Key must not be revoked.
- If the client connects but a **specific tool** fails with “insufficient scope”, the key is missing the narrow scope that tool requires — add the matching `mcp:*` scope or use legacy `mcp`.

## Rate limited

Slow down requests; see *Limits and rate limits*. MCP users should space **sync_supply_from_selected_meals** calls.

## If this doc disagrees with the app

**Trust the app** and contact support with steps to reproduce.
