# Async jobs and reliability

## Why some features “process”

**Receipt scan**, **AI meal generation**, **AI plan week**, and **URL import** can take longer than a single web request should wait. Ration **enqueues** work and returns a **job id**; the UI **polls** until **completed** or **failed**.

## Credits and refunds

Credit-gated jobs **reserve** cost up front with ledger discipline. If the job **fails** after deduction, the system is designed to **refund** credits so you are not charged for a failed run. Temporary UI lag can still occur—**refresh** balances before opening a ticket.

Queue consumers are **idempotent** with respect to terminal job status: if a job is already **completed** or **failed**, a platform retry does not call the model again. You are not charged twice for the same `requestId`; a stuck-looking job may simply take longer while the worker recovers.

## Launch-week ops runbook (Cloudflare-only)

Answer “Are we healthy?” from the Cloudflare dashboard + Analytics Engine within ~5 minutes. No external APM.

### Dashboard setup (OBS-3 — one-time)

1. **Workers & Pages → ration → Metrics** — baseline latency and error rate.
2. **Queues** — monitor depth on `ration-scan`, `ration-meal-generate`, `ration-plan-week`, `ration-import-url` during launch week.
3. **AI Gateway → ration-gateway** — set a spend limit + notification (hard backstop for Gemini).
4. **Billing → Billable Usage → Budget alert** — e.g. $50 / $100 projected monthly.
5. **Notifications** — Workers error-rate alerts; after deploy, optional AE SQL alerts on `ration_ops`.

### Analytics Engine (`ration_ops`)

Main + MCP Workers write low-cardinality counters via `RATION_ANALYTICS` (`app/lib/telemetry.server.ts`):

| Index (`indexes[0]`) | blobs[0] | When |
|----------------------|----------|------|
| `api` | `503` / `5xx` | D1 contention / unhandled API errors |
| `rate_limit` | `429` | Bucket deny or fail-closed |
| `queue_consumer` | `5xx` | Consumer throw → retry |
| `gemini` | `gemini_invoke` / `gemini_fail` | Each Gateway call |
| `refund` / `credit` | `refund` / `credit_deduct` | Ledger paths |

**No PII** in points (no emails, raw UUIDs, or secrets). Query via Analytics Engine SQL API against dataset `ration_ops` (prod) / `ration_ops_dev` (dev).

### SLO signals

| Status | Hub / API | Queues | AI |
|--------|-----------|--------|-----|
| **Green** | hub p95 &lt; 2s; 503 rate &lt; 0.5% | pending &lt; 100 | no Gateway limit breaches |
| **Yellow** | 503 &gt; 1% or hub p95 &gt; 4s | rising depth | check D1 metrics + hub match coalesce |
| **Red** | 503 storm | depth climbing + consumer errors | enable queue `max_concurrency`; Flagship kill on scan/generate if needed |

## What you should do as a user

- Leave the page open or return later; **status** updates when polling succeeds.
- If stuck **failed**, read the error text; retry once if it was transient (network).
- If balance looks wrong **after** failure, contact support with **time** and **operation** (no card numbers).

## Stripe webhooks

Purchases may take a **short delay** until Stripe’s webhook reaches Ration—see *Buying credits and Stripe*.

## MCP

MCP tools are mostly **synchronous** RPCs with their own **rate limits**; they do not use the same queue UX as scan/generate.

If the app shows different messaging, **trust the app**.
