# Pricing Updates Plan

## Overview

Three follow-up changes to the pricing implementation:

1. **Geo-based currency display** — Show USD for US visitors, EUR for everyone else
2. **Annual bonus credits** — Update from 60 to 65 to match Supply Run pack
3. **WELCOME65 coupon** — Replace WELCOME60 with one-use-per-email promo

---

## 1. Geo-Based Currency (USD vs EUR)

### Goal

- **US visitors** (`request.cf.country === "US"`): Display `$1`, `$5`, `$10`, `$25`, `$12/year`, `$2/month`
- **All others**: Display `€1`, `€5`, `€10`, `€25`, `€12/year`, `€2/month`

Same numbers, swap currency symbol. Stripe prices remain in a single currency (EUR) unless you create duplicate USD prices in Stripe—see note below.

### Implementation

**Data flow:** `request.cf` is available via `context.cloudflare.cf` (set in `workers/app.ts`). Pass `country` from loaders to components.

| File | Change |
|------|--------|
| `app/root.tsx` or shared loader | Add `country: context.cloudflare?.cf?.country ?? null` to root loader so it's available app-wide |
| `app/lib/stripe.server.ts` | Add `formatPrice(amount: string, currency: "EUR" \| "USD")` or extend CREDIT_PACKS/SUBSCRIPTION_PRODUCTS with both `priceEur` and `priceUsd` display strings |
| `app/routes/home.tsx` | Use `loaderData.country === "US"` to pick `$` or `€` when rendering prices |
| `app/routes/hub/pricing.tsx` | Same — pass `country` from loader, render `$X` or `€X` |
| `app/routes/api/checkout.tsx` | If using separate Stripe price IDs for USD, select the correct price based on `country`; otherwise keep current EUR prices |

**Stripe consideration:** The current setup uses EUR price IDs. For true USD checkout you would need to:

- Create USD prices in Stripe (e.g. `$1`, `$5`, etc.) and add `STRIPE_PRICE_*_USD` env vars
- In checkout, pass `country` (or derive from session) and use the USD price ID when `country === "US"`

If you prefer display-only (prices still charge in EUR), you can show `$25` but the actual charge stays in EUR. For a cleaner experience, create matching USD prices in Stripe.

### Helper

```typescript
// app/lib/currency.server.ts
export type DisplayCurrency = "EUR" | "USD";
export const CURRENCY_SYMBOL: Record<DisplayCurrency, string> = { EUR: "€", USD: "$" };

export function getDisplayCurrency(country: string | null): DisplayCurrency {
  return country === "US" ? "USD" : "EUR";
}

export function formatPrice(amount: number, currency: DisplayCurrency): string {
  return `${CURRENCY_SYMBOL[currency]}${amount}`;
}
```

---

## 2. Annual Bonus: 60 → 65 Credits

### Goal

Crew Member annual (and monthly) plans grant **65** credits on start and renewal, matching the Supply Run pack.

### Files to Update

| File | Change |
|------|--------|
| `app/lib/stripe.server.ts` | `SUBSCRIPTION_PRODUCTS.CREW_MEMBER_ANNUAL.creditsOnStart` and `creditsOnRenewal`: 60 → 65. Same for `CREW_MEMBER_MONTHLY` |
| `app/lib/ledger.server.ts` | `processSubscriptionCheckoutSession`: `addCredits(..., 60, ...)` → `addCredits(..., 65, ...)`. `processSubscriptionInvoice`: 60 → 65 |
| `app/lib/tiers.server.ts` | `CREW_MEMBER_PRODUCT.creditsOnSignup` and `creditsOnRenewal`: 60 → 65 |
| `README.md` | Update pricing table: "60/year" → "65/year", "60/month" → "65/month" |
| All UI that references `creditsOnStart` | Will update automatically if driven by `SUBSCRIPTION_PRODUCTS` |

---

## 3. WELCOME65 Coupon: One Use Per Email

### Current Behavior

- `WELCOME60` gives 100% off Supply Run (65 credits).
- `welcomeVoucherRedeemed` on `user` marks redemption; banner is hidden after redemption.
- Stripe applies the promo at checkout; webhook sets `welcomeVoucherRedeemed` when `pack === "SUPPLY_RUN"` and `amount_total === 0`.

Stripe itself does **not** enforce "one use per email" natively. You get it via:

1. **App-level:** `welcomeVoucherRedeemed` — prevents repeat redemption UX and can gate checkout.
2. **Stripe-level:** `restrictions.first_time_transaction` — only for customers with no prior successful payments.

### Recommended: Stripe `first_time_transaction` + App Tracking

**Step 1 — Create coupon in Stripe Dashboard**

1. **Stripe Dashboard** → **Products** → **Coupons** → **Create coupon**
2. **Type:** Percentage discount
3. **Percentage off:** 100%
4. **Duration:** Once
5. **Name:** `WELCOME65` (internal)

**Step 2 — Create promotion code**

1. **Products** → **Coupons** → select the coupon → **Create promotion code**
2. **Code:** `WELCOME65` (customer-facing)
3. **Restrictions:**
   - **First-time transaction:** ON — only customers with no successful payments can use it.
4. **Optional:** Expiration date
5. Copy the promotion code ID (e.g. `promo_xxxx`)

**Step 3 — Restrict to Supply Run (optional)**

- In Stripe, you can restrict a promo to specific products/prices. Attach it to the Supply Run price so it only applies there.
- Or leave it unrestricted; your app only shows it for the Supply Run pack.

**Step 4 — App changes**

| File | Change |
|------|--------|
| `app/lib/stripe.server.ts` | `WELCOME60` → `WELCOME65`, `appliesToPack: "SUPPLY_RUN"` |
| `app/lib/tiers.server.ts` | `WELCOME_VOUCHER.promoCode`: `"WELCOME60"` → `"WELCOME65"` |
| `wrangler.jsonc` | `STRIPE_PROMO_WELCOME60` → `STRIPE_PROMO_WELCOME65`, new promo ID |
| All UI strings | "WELCOME60" → "WELCOME65" |

**Step 5 — Enforce one-use in checkout (defence in depth)**

To ensure users who already redeemed cannot use the promo again:

- When creating credit checkout, pass `allow_promotion_codes: !welcomeVoucherRedeemed`.
- If `welcomeVoucherRedeemed` is true, Stripe Checkout will not show the promo code field.

### Summary: One Use Per Email

| Layer | Mechanism |
|-------|-----------|
| **Stripe** | `first_time_transaction: true` — only for customers with no prior successful payments |
| **App** | `welcomeVoucherRedeemed` — hide promo UX and optionally disable `allow_promotion_codes` for returning users |
| **Webhook** | Set `welcomeVoucherRedeemed = true` when Supply Run checkout completes with 100% discount |

Together, this gives strong one-use-per-email behavior.

---

## Checklist

- [ ] Implement geo-based currency (helper, loaders, UI)
- [ ] Add USD price IDs to Stripe and env (if doing real USD charges)
- [ ] Update annual/monthly credits 60 → 65
- [ ] Create WELCOME65 coupon in Stripe with `first_time_transaction`
- [ ] Rename WELCOME60 → WELCOME65 in code
- [ ] Set `allow_promotion_codes: !welcomeVoucherRedeemed` for credit checkout
