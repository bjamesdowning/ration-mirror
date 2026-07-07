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

## Ask Ration and billing

Ask Ration can explain how credits, Crew Member, checkout, and the billing portal work using the Copilot knowledge hub. It should send users to the in-app billing portal for subscription changes rather than performing billing mutations in chat.

Copilot answers should not ask for card numbers or Stripe subscription IDs. If a user needs to cancel, resume, update a payment method, or dispute a charge, direct them to **Manage billing** or human support.

## Refunds and disputes

Handle per **support policy** and Stripe outcome; the ledger is designed for consistent credit accounting when jobs fail—see *Reliability and async jobs*.

If in-app pricing or success messaging differs, follow **the product UI**.
