# Copilot chat: capability rollout (roadmap)

Internal sequencing for first-party **Ask Ration** capabilities after the Option A Copilot foundation is live. Each item should reuse the same security model: authenticated Ration session or mobile Bearer token, organization-scoped tools, server-side feature flag checks, tight rate limits on expensive actions, and minimal JSON safe for support.

## Shipped (baseline)

1. **Dedicated Copilot Worker** — `ration-copilot` serves Project Think / Agents Durable Object chat over WebSocket.
2. **Knowledge grounding** — Cloudflare AI Search indexes Ration docs and blog content for support Q&A.
3. **Pantry-aware tools** — Copilot reuses the MCP tool runtime for inventory, meals, supply, manifest, cargo updates, and nutrition.
4. **Allowance and credits** — Crew daily Copilot conversations are tracked separately; extra usage reconciles into the existing credit ledger (Ask token meter only — kitchen tools are credit-free).
5. **Billing portal guidance** — `get_billing_summary` plus settings/pricing/management URLs.
6. **Deep-link help** — Scan and Galley Import hard-blocks (`ration://scan`, `ration://galley/import`); other destinations via docs search.
7. **Remaining macros** — `get_nutrition_summary.vsGoal` + `match_meals` compact nutrition / `maxEnergyKcal`.
8. **Quick Eat** — `quick_eat_cargo` (create-if-missing pantry line, Manifest snack, optional private intake).
9. **URL / social import** — Copilot hard-blocks bare HTTPS and Instagram/TikTok/YouTube; MCP clients extract text then `create_meal`. No scrape tool.
10. **Primitive generate / plan week** — `create_meal` and `propose_manifest_plan` → `commit_manifest_plan`. No billed Gemini tools on Copilot or MCP.

## Recommended next (by value vs risk)

1. **Group / tier context** — read-only: active org name, whether the user is owner/admin/member, and whether the owner’s tier explains invite/share gates (no enumeration of other users’ emails).
2. **Ledger summary (optional)** — read-only recent credit movements for support debugging; requires strict field allowlisting and privacy review.
3. **Invoice / payment failure narrative (optional)** — Stripe-safe fields only; legal/support review before enabling.

## Principles

- **App wins** over Copilot copy: if the product changes, update articles and AI Search indexes first.
- **Human-in-the-loop** for destructive writes; the agent must collect explicit user confirmation before mutation tools that delete or materially change data.
- **Rate limit** every Copilot entry point; writes stricter than reads.
- **Kitchen tools stay credit-free.** Scan, URL import, Galley Generate, and Plan Week remain native billed jobs.
