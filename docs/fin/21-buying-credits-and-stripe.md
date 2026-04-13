# Buying credits and Stripe checkout

## Checkout

Ration uses **Stripe** for payments. From **Hub → Pricing** (or equivalent), choose a **credit pack** or **subscription** product. Embedded checkout collects payment securely; card handling stays on Stripe’s side.

## After payment

When checkout succeeds, Stripe sends a **webhook** to Ration so **credits or subscription status** update reliably—not only when your browser returns. You may land on a URL that includes **`transaction=success`** so the hub **refreshes** tier and balance immediately.

## Delays

Webhook delivery can take a short time. If credits or tier do not update:

1. Wait a minute and **refresh** the hub or revisit **Pricing**.
2. Confirm you paid under the **same account** and **active organization** you expect.
3. Contact support with the **time of purchase** and **email on the account**—avoid posting full card numbers.

## Billing portal

When the app offers **Manage billing** / portal, use it to update payment methods or cancel subscription per Stripe’s flows.

## Fin (chat) — billing data connectors

When **Fin** is wired to Ration’s Worker, support can answer renewal and cancellation questions using first-party APIs (same shared secret as other Fin connectors; never user session cookies).

- **Read billing:** `GET /api/fin/billing-summary?user_id=<contact_user_id>` — plan name, status, next payment / period end, whether the subscription is already set to cancel at period end.
- **Cancel at period end (chat):** `POST /api/fin/subscription-cancel` with JSON `{ "user_id": "<id>", "confirm": true }`. This schedules cancellation at the **end of the current period**; the user keeps Crew Member until then. It does **not** immediately delete the subscription.
- **Undo cancellation (chat):** `POST /api/fin/subscription-resume` with the same JSON shape — removes the pending cancel-at-period-end so the subscription renews normally.

Fin should **confirm intent** with the user before calling cancel or resume. If there is no Stripe customer or no mutable subscription, the API returns a safe `no_subscription`-style payload—never trust subscription IDs from the user; only `user_id` from the verified contact.

## Refunds and disputes

Handle per **support policy** and Stripe outcome; the ledger is designed for consistent credit accounting when jobs fail—see *Reliability and async jobs*.

If in-app pricing or success messaging differs, follow **the product UI**.
