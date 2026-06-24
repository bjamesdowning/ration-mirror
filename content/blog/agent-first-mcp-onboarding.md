---
title: "Let Your Agent Connect Itself: Agent-First MCP Onboarding for Ration"
description: "How autonomous MCP clients self-register via auth.md, configure Ration in Claude, Cursor, ChatGPT, or Goose, and start managing a real kitchen — then you claim ownership whenever you want."
date: 2026-06-19
dateModified: 2026-06-19
authorName: "Ration"
image: "/static/og/agent-first-mcp-onboarding.png"
tags:
  - MCP
  - agent-first onboarding
  - model context protocol
  - AI agent tools
  - Claude MCP
  - Cursor MCP
  - autonomous agents
  - pantry management
---

Most MCP integrations assume a human signs up first. You create an account, paste a server URL, complete browser OAuth, pick a household — and only then can your AI assistant touch your data.

That order made sense when every connection was human-initiated. It does not fit autonomous agents that can read documentation, call APIs, and configure themselves.

[Ration](https://ration.mayutic.com) inverts the flow: your agent can **self-register**, add Ration to its [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) configuration, and start managing a real kitchen — pantry, recipes, meal plan, shopping list — before you ever create an account. When you are ready, you [claim ownership](https://ration.mayutic.com/connect/claim) with email OTP. Everything the agent built stays put.

This is **agent-first MCP onboarding**: discovery via [`auth.md`](https://ration.mayutic.com/auth.md), full kitchen access on day one, claim when you want. The [connect landing](https://ration.mayutic.com/connect) covers both paths.

---

## What agent-first means for Ration

Agent-first does not replace the web app or OAuth sign-in for humans who already have an account. It adds a parallel entry point designed for autonomous MCP clients.

**Tier 0 — Agent alone.** The agent discovers Ration, calls a registration endpoint, receives an API key and MCP endpoint, configures its client, and operates the full kitchen loop: Cargo (pantry), Galley (recipes), Manifest (meal plan), Supply (shopping list).

**Tier 1 — Human claims.** You open the claim URL, verify your email with a one-time code, accept Terms of Service, and become the verified owner. If you already have a Ration account, the agent's kitchen merges into yours.

Important detail that often gets misunderstood: **Tier 0 keys have full MCP write scopes from the start.** Claiming transfers ownership — it does not unlock features or widen permissions. The same scopes apply before and after claim:

- `mcp:read`
- `mcp:inventory:write`
- `mcp:galley:write`
- `mcp:manifest:write`
- `mcp:supply:write`
- `mcp:preferences:write`

The kitchen an agent creates uses the same data model as a human signup. There is no shadow copy or separate "AI integration" database. See [how the MCP server is built](/blog/mcp-consumer-app-architecture) for the architecture behind that choice.

---

## How agent-first MCP onboarding works

Three steps. No human in the loop until you choose to claim.

### Step 1 — Agent discovers Ration

Autonomous clients should not scrape marketing pages. Ration publishes machine-readable discovery surfaces aligned with the [WorkOS auth.md pattern](https://workos.com/docs/authkit/agent-auth):

- **[`GET /auth.md`](https://ration.mayutic.com/auth.md)** — registration URI, claim URI, scopes, time limits, recovery paths
- **`Link: rel="agent-auth"`** header on app responses → `/auth.md`
- **`/.well-known/oauth-authorization-server`** — merged `agent_auth` block (`register_uri`, `claim_uri`, `identity_types_supported`)
- **`/.well-known/mcp/server-card.json`** — MCP transport and capabilities
- **DNS-AID** — `_mcp._agents.ration.mayutic.com` points to the MCP host

An agent that reads [`auth.md`](https://ration.mayutic.com/auth.md) or [`mcp.md`](https://ration.mayutic.com/mcp.md) has everything it needs to register without human guidance.

### Step 2 — Agent self-registers

```http
POST https://ration.mayutic.com/api/agent/auth
Content-Type: application/json

{ "type": "anonymous", "client_hint": "cursor" }
```

The response is returned **once** — store it securely:

```json
{
  "api_key": "rtn_live_…",
  "claim_token": "…",
  "claim_url": "https://ration.mayutic.com/connect/claim?token=…",
  "organization_id": "…",
  "mcp_endpoint": "https://mcp.ration.mayutic.com/mcp",
  "scopes": [
    "mcp:read",
    "mcp:inventory:write",
    "mcp:galley:write",
    "mcp:manifest:write",
    "mcp:supply:write",
    "mcp:preferences:write"
  ],
  "docs": {
    "auth_md": "https://ration.mayutic.com/auth.md",
    "connect": "https://ration.mayutic.com/connect"
  }
}
```

Rate limit: 5 registrations per minute per IP. No Better Auth session or browser sign-in required.

### Step 3 — Agent adds Ration to MCP configuration

Point the MCP client at `https://mcp.ration.mayutic.com/mcp` with the returned API key as a Bearer header. This pattern works across clients that support remote MCP servers or the `mcp-remote` bridge:

```json
{
  "mcpServers": {
    "ration": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.ration.mayutic.com/mcp",
        "--header",
        "Authorization:${RATION_AUTH_HEADER}"
      ],
      "env": {
        "RATION_AUTH_HEADER": "Bearer rtn_live_your_key_here"
      }
    }
  }
}
```

After connecting, call `get_context` to confirm the kitchen is live. The response includes onboarding state, authorized scopes, and suggested next actions (including `claim_kitchen` while unclaimed).

---

## The prompt to give your agent

Copy this into Cursor, Claude, ChatGPT, Goose, or any agent that can fetch URLs and edit MCP config:

```text
Read https://ration.mayutic.com/auth.md and follow the Tier 0 anonymous registration flow.

1. POST to the register URI with { "type": "anonymous", "client_hint": "<your-client-name>" }.
2. Save the api_key, claim_url, and mcp_endpoint from the response — they are returned once.
3. Add the MCP server to your configuration using the api_key as a Bearer Authorization header.
4. Call get_context to confirm connection.
5. Add a few sample pantry items so I can see the kitchen is working.
6. Share the claim_url with me when done.
```

This is the fastest path from zero to a populated kitchen. You review the results, then claim when you want full ownership.

---

## MCP client setup: Claude, Cursor, ChatGPT, Goose, and more

Agent-first onboarding uses **API key auth** (from self-registration), not browser OAuth. OAuth remains the recommended path if you already have a Ration account — see [Your Kitchen Has an API Now](/blog/mcp-kitchen-assistant).

### Cursor

Cursor supports remote MCP servers. After registration, your agent can add the server URL and Bearer header to Cursor's MCP settings, or you can paste the `mcp-remote` JSON above into your config manually.

One-click OAuth (human path): [ration.mayutic.com/connect](https://ration.mayutic.com/connect)

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ration": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.ration.mayutic.com/mcp",
        "--header",
        "Authorization:${RATION_AUTH_HEADER}"
      ],
      "env": {
        "RATION_AUTH_HEADER": "Bearer rtn_live_your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. Ask: *"Call get_context on Ration and list my pantry."*

### ChatGPT desktop

ChatGPT supports remote MCP with OAuth discovery for human-initiated connections. For agent-provisioned kitchens, use the same API key + Bearer header pattern as Claude. Add the MCP server URL and authorization header in ChatGPT's MCP settings after your agent completes Tier 0 registration.

Human OAuth path: add `https://mcp.ration.mayutic.com/mcp` and complete browser sign-in when prompted.

### Goose

[Goose](https://block.github.io/goose/docs/mcp/) supports MCP extensions with remote server configuration. After agent registration, configure a remote MCP server pointing at `https://mcp.ration.mayutic.com/mcp` with an `Authorization: Bearer rtn_live_…` header. Exact YAML shape depends on your Goose version — the transport URL and Bearer token are the portable parts.

If Goose supports `mcp-remote` via command invocation, the Claude Desktop JSON block above applies unchanged.

### Zed and other OAuth-capable clients

Zed, Warp, and similar clients work well with OAuth when you already have an account. For agent-first onboarding, fall back to the API key + `mcp-remote` pattern until the agent completes registration.

---

## What your agent can do before you sign up

Full write access means the agent can run the complete kitchen loop without waiting for you:

**Populate the pantry.** After a grocery run, the agent calls `add_cargo_item` for each item — or parses receipt text locally and runs `preview_inventory_import` → `apply_inventory_import`. Ration merges duplicates automatically.

**Find cookable meals.** `match_meals` cross-references pantry against saved recipes. Strict mode returns only fully cookable meals; delta mode lists what's missing.

**Plan the week.** `bulk_add_meal_plan_entries` schedules dinners; `sync_supply_from_selected_meals` rebuilds the shopping list from the plan.

**Rescue expiring food.** `get_expiring_items` surfaces what needs attention; the agent can suggest meals and add missing ingredients to Supply.

The compound workflow — before you ever open the app:

```text
1. Agent registers and connects MCP
2. Agent logs this week's groceries into Cargo
3. Agent matches meals and plans Tuesday dinner
4. Agent shares claim_url with you
5. You claim → everything is already there
```

While unclaimed, `get_context` returns `onboarding.claimUrl` and nudges toward claim on capacity limits. Why [structured pantry data](/blog/pantry-data-problem) matters: without it, "what can I cook tonight?" stays a guess.

---

## Claiming your kitchen

When you are ready for ownership:

1. Open the **claim URL** your agent saved (or reissue one — see below)
2. Enter your email address
3. Enter the 6-digit OTP from your inbox
4. Accept Terms of Service

**New email:** the stub account becomes yours with a verified email. Scopes unchanged.

**Existing Ration account:** the agent's kitchen **merges** into your personal org — cargo, recipes, supply lists, meal plan entries, and ledger history move over. The agent API key is re-pointed to your account.

Claim page: [ration.mayutic.com/connect/claim](https://ration.mayutic.com/connect/claim)

### Recovery if you lose the claim URL

- **Have the API key?** Paste it on the claim page or call `POST /api/agent/auth/claim/reissue` with `Authorization: Bearer rtn_live_…` to get a fresh claim URL.
- **Active kitchens stay claimable:** each API or MCP authentication slides the claim token expiry forward by 180 days.
- **Lost both key and URL?** Contact support — there is no automated recovery without one of them.

---

## Agent-first vs OAuth-first

| | Agent-first | OAuth-first |
|--|-------------|-------------|
| Who acts first | Autonomous agent | Human with account |
| Auth method | API key from `POST /api/agent/auth` | Browser OAuth + household picker |
| Best for | Try-before-claim, agent-led setup | Existing account, multi-household consent |
| MCP scopes at start | Full write (`mcp:*` write set) | Scoped per OAuth grant |
| Human signup required | No (until claim) | Yes |

Both paths operate the same MCP tools against the same data. Pick agent-first when you want the agent to do the setup work; pick OAuth when you already know which household to connect.

---

## Limits and honesty

**Pre-claim write rate limit:** 10 writes per minute per org and per key (15/min after claim). Enough for conversational use; tighter to reduce abuse on unclaimed kitchens.

**Free tier capacity:** 35 pantry items, 15 recipes, 3 supply lists — same as human free accounts. Hitting limits returns `capacity_exceeded` with a claim nudge.

**Orphan purge:** unclaimed kitchens with no API activity for 180 days are deleted (D1, Vectorize, R2). Claimed kitchens are never purged.

**Not available via MCP:** AI credit features — receipt scanning, meal generation, weekly auto-planning — remain dashboard-only. MCP is for structured CRUD, not triggering billed AI jobs. Semantic search and meal matching work fully.

---

## FAQ

**Can my agent create a Ration account without me signing up?**

Yes. `POST /api/agent/auth` with `{ "type": "anonymous" }` provisions a full kitchen and returns an API key plus claim URL. No browser or email required at Tier 0.

**How do I claim an agent-created kitchen?**

Open the claim URL, enter your email, verify the OTP, and accept ToS at [ration.mayutic.com/connect/claim](https://ration.mayutic.com/connect/claim).

**Does claiming unlock more MCP permissions?**

No. Scopes are identical before and after claim. Claiming transfers ownership to a verified human — it is not a tier upgrade.

**What MCP clients support agent-first onboarding?**

Any client that supports remote MCP with a Bearer Authorization header: Cursor, Claude Desktop, ChatGPT desktop, Goose, and others via `mcp-remote`. OAuth-only clients can use the human path in [Your Kitchen Has an API Now](/blog/mcp-kitchen-assistant).

**What happens if I never claim?**

The agent keeps operating until the kitchen goes idle for 180 days, then unclaimed data is purged. Each API use resets the 180-day claim window.

**Can I merge an agent kitchen into my existing account?**

Yes. Complete claim with the email address already on your Ration account. Cargo, Galley, Manifest, and Supply data migrate automatically.

---

## Get started

**Let your agent connect itself:** paste the [prompt above](#the-prompt-to-give-your-agent) into your MCP client.

**Claim when ready:** [ration.mayutic.com/connect/claim](https://ration.mayutic.com/connect/claim)

**Human OAuth path:** [ration.mayutic.com/connect](https://ration.mayutic.com/connect)

**Machine-readable spec:** [ration.mayutic.com/auth.md](https://ration.mayutic.com/auth.md)

Start free — no credit card required.
