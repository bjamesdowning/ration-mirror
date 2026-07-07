# Copilot chat: capability rollout (roadmap)

Internal sequencing for first-party **Ask Ration** capabilities after the Option A Copilot foundation is live. Each item should reuse the same security model: authenticated Ration session or mobile Bearer token, organization-scoped tools, server-side feature flag checks, tight rate limits on expensive actions, and minimal JSON safe for support.

## Shipped (baseline)

1. **Dedicated Copilot Worker** — `ration-copilot` serves Project Think / Agents Durable Object chat over WebSocket.
2. **Knowledge grounding** — Cloudflare AI Search indexes Ration docs and blog content for support Q&A.
3. **Pantry-aware tools** — Copilot reuses the MCP tool runtime for inventory, meals, supply, manifest, and cargo updates.
4. **Allowance and credits** — Crew daily Copilot conversations are tracked separately; extra usage can reconcile into the existing credit ledger.

## Recommended next (by value vs risk)

1. **Billing portal guidance** — explain subscription state and route users to **Manage billing** for Stripe-hosted changes.
2. **Group / tier context** — read-only: active org name, whether the user is owner/admin/member, and whether the owner’s tier explains invite/share gates (no enumeration of other users’ emails).
3. **Deep-link help** — return canonical destinations (`/hub/settings`, `/hub/pricing`, `ration://ask`, etc.) for “where do I …?” questions; keep answers aligned with [INDEX.md](./INDEX.md) articles.
4. **Ledger summary (optional)** — read-only recent credit movements for support debugging; requires strict field allowlisting and privacy review.
5. **Invoice / payment failure narrative (optional)** — Stripe-safe fields only; legal/support review before enabling.

## Principles

- **App wins** over Copilot copy: if the product changes, update articles and AI Search indexes first.
- **Human-in-the-loop** for destructive writes; the agent must collect explicit user confirmation before mutation tools that delete or materially change data.
- **Rate limit** every Copilot entry point; writes stricter than reads.
