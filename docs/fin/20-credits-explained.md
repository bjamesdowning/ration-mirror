# AI credits explained

## Org-wide balance

**AI credits** belong to the **organization** (group), not to a single user. Any member running a credit-gated feature in that group draws from the **same pool**.

## Atomic balance

Deductions are applied safely at the database layer so you cannot go **negative** through normal concurrent use—if balance is insufficient, the app should refuse the operation with a clear message.

## What consumes credits

| Operation | Credits (typical) |
|-----------|-------------------|
| Receipt scan | 2 |
| AI meal generation | 2 |
| Import recipe from URL | 1 |
| AI plan week | 3 |

**Note:** Internal roadmaps may reserve costs for future features—always check **Pricing** in the app for the live matrix.

## What does **not** use AI credits

- **MCP tool calls** (read and write) **do not** debit AI credits. MCP uses **rate limits** instead (per organization and, for writes, an additional cap **per API key**) — see *Limits and rate limits*.
- Ordinary CRUD in the hub (manual cargo, manual recipes) does not spend credits unless tied to an AI feature above.

## Buying more

Credit packs and subscriptions are purchased via **Stripe**—see *Buying credits and Stripe*.

If the app shows different numbers, **the app is correct**.
