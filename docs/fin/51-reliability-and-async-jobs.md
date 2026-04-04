# Async jobs and reliability

## Why some features “process”

**Receipt scan**, **AI meal generation**, **AI plan week**, and **URL import** can take longer than a single web request should wait. Ration **enqueues** work and returns a **job id**; the UI **polls** until **completed** or **failed**.

## Credits and refunds

Credit-gated jobs **reserve** cost up front with ledger discipline. If the job **fails** after deduction, the system is designed to **refund** credits so you are not charged for a failed run. Temporary UI lag can still occur—**refresh** balances before opening a ticket.

## What you should do as a user

- Leave the page open or return later; **status** updates when polling succeeds.
- If stuck **failed**, read the error text; retry once if it was transient (network).
- If balance looks wrong **after** failure, contact support with **time** and **operation** (no card numbers).

## Stripe webhooks

Purchases may take a **short delay** until Stripe’s webhook reaches Ration—see *Buying credits and Stripe*.

## MCP

MCP tools are mostly **synchronous** RPCs with their own **rate limits**; they do not use the same queue UX as scan/generate.

If the app shows different messaging, **trust the app**.
