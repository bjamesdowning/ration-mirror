# Monitoring Runbook — Ration

## Overview

This runbook defines what to watch, alert thresholds, and response procedures
for Ration running on Cloudflare Workers + D1 + KV.

---

## 1. Cloudflare Dashboard Observability

Ration has `"observability": { "enabled": true }` in `wrangler.jsonc`. This
enables automatic Worker request/error metrics in the Cloudflare dashboard.

**Location**: Cloudflare Dashboard → Workers → ration → Metrics

### Key Metrics to Monitor

| Metric | Alert Threshold | Response |
|---|---|---|
| Worker error rate | > 1% of requests | Check logs for D1 or AI Gateway errors |
| Worker p99 latency | > 5,000ms | Check D1 write contention or AI timeouts |
| CPU time p99 | > 20ms | Review `matchMeals()` or import paths |
| D1 reads / day | > 10B | Investigate unbounded queries |
| D1 writes / day | > 10M | Investigate write spike source |

---

## 2. Structured Log Events

Ration emits structured logs via `app/lib/logging.server.ts`. The following
events are the most operationally relevant.

### D1 Write Telemetry (`trackD1BatchSize`, `trackWriteOperation`)

Emitted by: `createMeal`, `cookMeal`, `ingestCargoItems`

```
[Telemetry] d1_batch_size_warning
  operation: "createMeal"
  statement_count: 82
  limit: 100
  utilization_pct: 82
  organization_ref: "abc123..."
```

**Alert**: `utilization_pct >= 75` — batch approaching D1 limit.

```
[Telemetry] write_op_complete
  operation: "cookMeal"
  duration_ms: 1450
  organization_ref: "abc123..."
```

**Alert**: `duration_ms > 3000` — D1 write latency under contention.

### Supply Sync Telemetry

The supply sync pipeline (`syncSupplyFromIngredientRows`) emits per-phase
timing. Look for:

```
[Telemetry] supply_sync
  event_name: "sync_complete"
  inventory_fetch_duration_ms: 850   <- should be < 200ms
  aggregate_duration_ms: 120
  insert_duration_ms: 340
```

**Alert**: `inventory_fetch_duration_ms > 500ms` — cargo table may be too large,
consider adding pagination to supply sync.

### D1 Contention Errors

`handleApiError` detects and logs D1 contention with:

```
[API] D1 contention or timeout
  errorMessage: "SQLITE_BUSY: database is locked"
```

**Alert**: More than 5 occurrences per minute — write TPS approaching D1 limits.
Check which operations are the source and consider queuing or backoff.

### Credit Refund Failure (CRITICAL)

```
[CRITICAL] Credit refund failed
  organizationId: "..."
  amount: 2
  reason: "Scan"
```

**Response**: Manual credit reconciliation required. Query `ledger` table for
the affected `organizationId` to find the deduction without a corresponding
refund and apply a correction via admin.

---

## 3. KV Rate Limiter Health

Rate limiting uses KV sliding windows. KV writes are capped at:
- Free tier: 1,000 writes/day
- Paid tier: unlimited

**Monitor**: KV write count in Cloudflare Dashboard → Workers KV → RATION_KV.

If KV writes spike (e.g., during an attack), the rate limiter fails open
(logs `rate limit KV put failed`) rather than blocking all requests. This is
by design — advisory rate limiting.

---

## 4. Session Table Size

The CRON purge (`0 3 * * *`) logs:

```
[CRON] Purged 142 expired session(s).
```

**If the count is 0 for 30+ consecutive days**, the CRON may have stopped
firing — check Workers Cron Triggers in the Cloudflare Dashboard.

**If the count is > 10,000 per day**, session creation rate is unusually high —
investigate possible bot/abuse traffic.

---

## 5. AI Gateway Health

AI scan and meal generation calls go through Cloudflare AI Gateway.

**Monitor**: Cloudflare Dashboard → AI Gateway → ration-gateway

| Metric | Alert Threshold | Response |
|---|---|---|
| Request error rate | > 5% | Check Google AI Studio status |
| Request latency p95 | > 15s | Check SCAN_MODEL availability |
| Cache hit rate | < 30% | Expected low — scans are unique images |

**Credits auto-refund** on AI failure (see `withCreditGate` in
`ledger.server.ts`). Users receive their credits back if inference fails.

---

## 6. Stripe Webhook Health

Stripe retries webhooks for up to 3 days on failure. The webhook handler
(`api/webhook.tsx`) is idempotent via `sessionId`-keyed ledger entries.

**If payment fulfillment is suspected missing**:

```sql
-- Check if a session was fulfilled
SELECT * FROM ledger
WHERE reason LIKE '%cs_live_...<session_id>%'
  AND organization_id = '<org_id>';
```

If no row, the webhook was never processed — manually trigger via Stripe
Dashboard → Webhooks → Resend.

---

## 7. Quick Diagnostics

### Is D1 healthy?

```bash
# Check D1 row counts
wrangler d1 execute ration-db --command "SELECT COUNT(*) FROM cargo;"
wrangler d1 execute ration-db --command "SELECT COUNT(*) FROM session WHERE expires_at > unixepoch();"
```

### Are indexes present?

```bash
wrangler d1 execute ration-db --command ".indexes"
```

Expected indexes include: `session_user_id_idx`, `cargo_org_expires_idx`,
`cargo_org_idx`, `cargo_domain_idx`, `meal_org_id_idx`, `member_org_idx`, etc.

### Trigger CRON manually (testing)

```bash
wrangler dev --test-scheduled
# then in a separate terminal:
curl "http://localhost:8787/__scheduled?cron=0+3+*+*+*"
```
