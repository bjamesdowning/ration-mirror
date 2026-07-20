# Billing troubleshooting

## Paid but credits or tier not updated

1. Wait **1–2 minutes**—Stripe **webhooks** can lag slightly.
2. Open **Hub → Pricing** with **`?transaction=success`** if you just returned from checkout (forces refresh in some layouts).
3. Confirm you purchased while the **intended organization** was active.
4. Check **Stripe receipt email** for success.

## Subscription status

Use **Manage billing** / customer portal from **Pricing** or **Settings** when available. Cancellations and payment method updates happen in **Stripe’s** portal (web) or the **App Store** (iOS), depending on where you subscribed.

**Ask Ration** can report live subscription tier, renewal or end date, and credit balance via `get_billing_summary`. For changes (cancel, update payment method), it directs you to **Manage billing** in Settings or the App Store — it does not mutate billing in chat. If chat and the app disagree, **the app wins**—refresh Settings or Pricing and update support docs if needed.

## Wrong amount charged

Compare **Stripe receipt** line items to **Pricing** in-app. For disputes, use **Stripe** or your card issuer per their policies; Ration support can explain **product mapping** but cannot override processor decisions.

## Tax or currency

Checkout shows **final currency and tax** as configured in Stripe. If something looks off, screenshot the **checkout summary** (redact card) for support.

## What to send support

- **Email** on the account  
- **Approximate time** of purchase  
- **Organization name**  
- Whether you used **checkout** vs **portal**  
- **Never** send full card numbers, CVC, or API keys

## Welcome code issues

See *Welcome credits*. New human accounts receive **12 credits** automatically.

If Pricing shows a different bundle than you remember, **Pricing is authoritative**.
