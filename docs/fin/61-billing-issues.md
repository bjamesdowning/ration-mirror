# Billing troubleshooting

## Paid but credits or tier not updated

1. Wait **1–2 minutes**—Stripe **webhooks** can lag slightly.
2. Open **Hub → Pricing** with **`?transaction=success`** if you just returned from checkout (forces refresh in some layouts).
3. Confirm you purchased while the **intended organization** was active.
4. Check **Stripe receipt email** for success.

## Subscription status

Use **Manage billing** / customer portal from **Pricing** or **Settings** when available. Cancellations and payment method updates happen in **Stripe’s** portal.

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

See *Welcome offer (WELCOME65)*. Codes can be **single-use** or **product-specific**.

If Pricing shows a different bundle than you remember, **Pricing is authoritative**.
