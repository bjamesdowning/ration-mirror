# Code Review: Pricing Strategy Implementation

**Date:** 2026-02-08  
**Scope:** Monetization (tiers, credits, Stripe checkout/webhook, capacity, welcome voucher, UI).

---

## Pre-Merge Checklist Summary

| Check | Status |
|-------|--------|
| `bun run lint` | ✅ Pass |
| `bun run typecheck` | ✅ Pass |
| `bun run test:unit` | ✅ Pass |
| No `console.log` in production code | ✅ (only in logging docs) |
| No Node.js APIs | ✅ (Edge-only) |
| Env via `context.cloudflare.env` | ✅ |
| React Router: loaders for data, fetchers for mutations | ✅ |
| Zod at API boundary / auth + RLS | ✅ (existing patterns) |
| Schema in `app/db/schema.ts`, migrations in `drizzle/` | ✅ |
| Design tokens (Orbital Luxury) | ✅ (pricing, prompts, badges) |

---

## Summary of Changes (Pricing Strategy)

- **Tiers:** Free vs Crew Member; limits in `tiers.server.ts`, enforced via `capacity.server.ts` (KV cache, `CapacityExceededError`).
- **Stripe:** Credit packs (4) and Crew Member annual subscription; price/promo IDs from `wrangler.jsonc` vars; helpers in `stripe.server.ts` (`getCreditPackPriceId`, `getSubscriptionPriceId`, `getPromotionCodeId`, `getCreditsForPriceId(env, priceId)`).
- **Checkout:** `/api/checkout` supports `type=credits` (with `allow_promotion_codes`) and `type=subscription`; **subscription_data.metadata** set so subscription object has `userId`, `organizationId`, `tier` for webhooks.
- **Webhook:** `checkout.session.completed` (credits vs subscription), `invoice.paid` (renewal credits), `customer.subscription.deleted` (downgrade), `customer.subscription.updated` (logging); WELCOME60 applied when `pack === "SUPPLY_RUN"` and `amount_total === 0`; idempotency and replay protection in place.
- **Ledger:** Credits from metadata for one-time checkout; subscription start/renewal/downgrade; tier cache invalidation; no use of `getCreditsForPriceId` without `env` (fulfillment uses metadata.credits).
- **Capacity:** Enforced on inventory, meals, grocery lists, owned groups, invites, and grocery-list sharing; consistent `getGroupTierLimits` + `checkCapacity` / `checkOwnedGroupCapacity`.
- **UI:** Pricing page (plans + credit packs, WELCOME60 banner), upgrade prompts, tier badge, settings “Your Plan” + conditional CreditShop, capacity indicators, billing portal.

---

## Fixes Applied During Review

1. **Subscription metadata on Stripe Subscription object**  
   Checkout session now sets `subscription_data.metadata` (userId, organizationId, tier) so `invoice.paid` and `customer.subscription.deleted` receive a subscription with metadata (session metadata is not automatically copied to the subscription).

2. **Removed unused checkout metadata**  
   Removed `welcomePromoCodeId` from credit checkout metadata; webhook uses `pack === "SUPPLY_RUN"` and `amount_total === 0` for welcome voucher redemption.

3. **Removed unused import**  
   Dropped `getPromotionCodeId` from `app/routes/api/checkout.tsx`.

4. **Env types for secrets**  
   Extended `app/types/env.d.ts` with optional `BETTER_AUTH_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` so typecheck passes (secrets are set via `wrangler secret put`).

5. **Webhook: STRIPE_WEBHOOK_SECRET guard**  
   Return 503 if `STRIPE_WEBHOOK_SECRET` is missing before `constructEvent`, and use a local variable so TypeScript narrows to `string`.

6. **Settings: optional Stripe key**  
   Render `CreditShop` only when `loaderData.stripePublishableKey` is defined to satisfy `stripePublishableKey: string`.

---

## Concerns / Follow-ups

- **Subscription metadata:** Relying on `subscription_data.metadata` for renewals and downgrades; confirm in Stripe Dashboard that existing subscriptions (if any) have metadata; new checkouts will have it.
- **Settings fulfillment:** Loader still calls `processCheckoutSession(env, sessionId)` on return from Stripe; webhook should be the source of truth. Consider making this a no-op or only for display (session status) to avoid double-fulfillment if webhook is delayed; idempotency in `addCredits` prevents double-crediting but tier/other side effects could be duplicated. Document or refactor as needed.
- **Rate limiting:** Checkout is rate-limited; webhook is not (Stripe retries); consider idempotency only for webhook path.

---

## Approval

**Status:** Approved with the above fixes applied. Ready for quick-commit (lint, test, typecheck, db:generate, db:migrate:prod, commit, push) from this worktree.
