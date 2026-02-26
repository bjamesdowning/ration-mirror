# KV Usage Audit & Optimization Plan

## Executive Summary

The application's KV usage is dominated by **rate limiting** — every API endpoint calls `checkRateLimit()`, which performs a KV read + KV write on **every single request**. The Cloudflare KV free tier allows **1,000 writes/day**, meaning even ~500 API requests consume 50% of the daily budget. This is the root cause of the problem.

---

## Current State: KV Usage Inventory

### KV Binding

- **Name:** `RATION_KV` — defined in [`wrangler.jsonc`](wrangler.jsonc:52)
- **Single namespace** used for all KV operations

### Use Case 1: Rate Limiting (PRIMARY — ~99% of writes)

**File:** [`app/lib/rate-limiter.server.ts`](app/lib/rate-limiter.server.ts:1)

**Pattern:** Every API call triggers `checkRateLimit()` which:
1. **Reads** from KV: `kv.get()` at [line 166](app/lib/rate-limiter.server.ts:166)
2. **Writes** to KV: `kv.put()` at [line 178](app/lib/rate-limiter.server.ts:178) (new window) or [line 219](app/lib/rate-limiter.server.ts:219) (increment)

**Critical problem:** A KV write happens on **every allowed request** — the only case where no write occurs is when the rate limit is *exceeded* (lines 198–208). Well-behaved users generate the most KV writes.

**18 rate limit types** defined at [lines 41–137](app/lib/rate-limiter.server.ts:41):

| Type | Window | Max Requests | Key Prefix |
|------|--------|-------------|------------|
| checkout | 60s | 10 | rate:checkout |
| scan | 60s | 20 | rate:scan |
| search | 10s | 30 | rate:search |
| generate_meal | 60s | 10 | rate:generate_meal |
| recipe_import | 60s | 10 | rate:recipe_import |
| group_create | 60s | 5 | rate:group_create |
| group_invite | 60s | 10 | rate:group_invite |
| credits_transfer | 60s | 10 | rate:credits_transfer |
| inventory_batch | 60s | 20 | rate:inventory_batch |
| automation | 60s | 10 | rate:automation |
| auth_public | 60s | 20 | rate:auth_public |
| shared_public | 60s | 60 | rate:shared_public |
| shared_toggle | 60s | 30 | rate:shared_toggle |
| inventory_mutation | 60s | 60 | rate:inventory_mut |
| meal_mutation | 60s | 30 | rate:meal_mut |
| grocery_mutation | 60s | 60 | rate:grocery_mut |
| user_purge | 300s | 1 | rate:user_purge |
| api_export | 60s | 30 | rate:api_export |
| api_import | 60s | 20 | rate:api_import |

**~40+ endpoint call sites** across the application, including:
- [`api.auth.$`](app/routes/api.auth.$.ts:15) — both loader AND action (2 calls per auth flow)
- All meal CRUD routes, supply list routes, cargo routes
- Search, scan, checkout, webhook, group management
- Public shared routes (keyed by IP)

### Use Case 2: Stripe Webhook Idempotency (~1% of writes)

**File:** [`app/lib/idempotency.server.ts`](app/lib/idempotency.server.ts:1)

**Pattern:** Stripe webhook handler at [`app/routes/api/webhook.tsx`](app/routes/api/webhook.tsx:57) calls `checkStripeWebhookProcessed()` which:
1. **Reads** from KV: `kv.get()` at [line 44](app/lib/idempotency.server.ts:44)
2. **Writes** to KV: `kv.put()` at [line 60](app/lib/idempotency.server.ts:60) (only on first occurrence)

**Assessment:** This is appropriate, low-volume, and correctly implemented. Stripe webhooks are infrequent and the check-then-mark pattern with 24h TTL is the right approach.

---

## Write Budget Analysis

### Free Tier Constraint
- **1,000 KV writes/day** (resets at 00:00 UTC)
- **1,000 KV deletes/day**
- **100,000 KV reads/day**

### Current Write Consumption Per User Session

A typical user session might involve:
- 2 auth checks (page load loader + action) → 2 writes
- 5 page navigations with API calls → 5 writes
- 3 meal operations → 3 writes
- 5 supply list operations → 5 writes
- 2 searches → 2 writes
- **Total: ~17 writes per light session**

This means **~60 sessions/day exhaust the 1,000 write limit**.

For even a single power user doing 50 API calls in a session, that alone is 50 writes (5% of daily budget).

### Worst Offenders by Write Volume

1. **`auth_public`** — Fires on EVERY page load (both loader and action on `/api/auth/*`). A user navigating 10 pages = 20 KV writes.
2. **`search`** — 10-second window, fires per search request. A user typing and searching = rapid burst of writes.
3. **`grocery_mutation`** / `inventory_mutation` / `meal_mutation` — High-volume CRUD operations.

---

## Issues Identified

### Issue 1: Write-Per-Request Anti-Pattern (CRITICAL)

Every `checkRateLimit()` call writes to KV regardless of whether the user is anywhere near the rate limit. The function at [lines 152–233](app/lib/rate-limiter.server.ts:152) always writes for allowed requests.

**Impact:** 1:1 ratio of API calls to KV writes.

### Issue 2: No In-Memory Caching (HIGH)

Workers can reuse isolates across multiple requests. Currently, every request hits KV directly with zero caching. Multiple rapid requests from the same user to the same isolate each generate separate KV read+write operations.

**Impact:** No benefit from isolate reuse; KV is hit even when the data is milliseconds old.

### Issue 3: No Edge Cache TTL on KV Reads (MEDIUM)

Cloudflare KV supports a `cacheTtl` option on `get()` that caches values in the edge PoP for a configurable duration, reducing read latency and read costs. Currently unused.

**Impact:** Extra read latency and unnecessary read operations.

### Issue 4: Race Condition on High-Concurrency (LOW — but worth noting)

The rate limiter uses non-atomic read-then-write. Under concurrent requests to different isolates, two requests could both read count=5, both write count=6, allowing one extra request through. This is acceptable for rate limiting (approximate is fine), but worth documenting.

### Issue 5: Not Scalable for Growth (STRATEGIC)

With 1,000 writes/day, the app cannot support more than ~60 sessions/day on the free tier. Even a modest paid tier would need careful budgeting. The architecture should be refactored to not depend on KV writes scaling linearly with request volume.

---

## Recommended Fixes

### Fix 1: In-Memory Rate Limit Cache (Biggest Impact)

Add an in-memory `Map` that caches rate limit windows within a Worker isolate. This reduces KV operations to:
- **First request in isolate:** KV read + KV write
- **Subsequent requests within cache TTL:** 0 KV operations (pure in-memory)
- **Cache TTL:** 5 seconds for most, 2 seconds for search

**Write reduction estimate:** 70–90% for active users generating burst traffic.

**Trade-off:** Multiple isolates may each allow their own window of requests before syncing. This means the rate limit becomes *approximate* rather than *exact*. For a security rate limiter this is perfectly acceptable — even major companies like Cloudflare, AWS, and Stripe use approximate distributed rate limiting.

### Fix 2: Skip-Write-on-First-Request (Easy Win)

When a new window starts, do not write `{count: 1}` to KV. Instead, treat the absence of a key as count=0 or count=1. Only write on the *second* request in a window.

**Convention:**
- Key absent → 0 previous requests this window
- Key present with count N → N requests this window

This eliminates writes for any endpoint a user hits only once per window (very common for infrequent endpoints like `user_purge`, `checkout`, `group_create`).

**Write reduction estimate:** 30–50% for endpoints with bursty but infrequent patterns.

### Fix 3: Add cacheTtl to KV Reads (Easy Win)

Use `kv.get(key, { type: 'json', cacheTtl: 5 })` to cache reads at the edge for 5 seconds. This is a one-line change that reduces read latency and read count but does NOT reduce writes.

### Fix 4: Consider Removing Rate Limiting from Low-Risk Authenticated Endpoints (Strategic)

Not every endpoint needs KV-backed distributed rate limiting. Many authenticated endpoints already have natural throttles:
- Database constraints prevent abuse
- Authentication itself is a barrier
- Capacity checks already exist

Consider removing rate limiting from low-risk CRUD endpoints like `cargo.$id`, `provisions.$id`, `meal-plans.$id.entries.$entryId` etc., where the security benefit is minimal compared to the KV cost.

### Fix 5: Evaluate Cloudflare Rate Limiting Product (Strategic / Future)

Cloudflare offers a built-in [Rate Limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/) product that operates at the edge BEFORE the Worker executes. This could offload `auth_public` and `shared_public` rate limiting entirely, reducing both Worker CPU time and KV usage.

---

## Proposed Architecture

### Current Flow (1 KV read + 1 KV write per request)

```
Request → Worker → checkRateLimit() → KV.get() → KV.put() → Process Request
```

### Proposed Flow (amortized to ~0.1 KV ops per request)

```
Request → Worker → In-Memory Cache Hit? 
  → YES: Return cached result, no KV ops
  → NO: KV.get(cacheTtl:5) → Cache in memory → Process Request
     → Only write to KV when: new window starts AND count > 1, OR cache expires
```

---

## Implementation Plan

### Phase 1: Quick Wins (Immediate)
1. Add in-memory cache Map to [`rate-limiter.server.ts`](app/lib/rate-limiter.server.ts:1)
2. Implement skip-write-on-first-request logic
3. Add `cacheTtl` to KV read operations

### Phase 2: Endpoint Audit (Short-term)
4. Identify and remove rate limiting from low-risk authenticated endpoints
5. Consolidate similar rate limit types where possible

### Phase 3: Strategic (Future)
6. Evaluate Cloudflare Rate Limiting product for public endpoints
7. Consider D1-based or Analytics Engine rate counting for audit trail

---

## Justification

| Decision | Justification |
|----------|---------------|
| In-memory cache | Industry standard: Redis, Nginx, HAProxy all use local counters with periodic sync. Approximate rate limiting is accepted by IETF RFC 6585 and implemented by AWS API Gateway, Stripe, and Cloudflare themselves. |
| Skip-write-on-first | Eliminates writes for single-hit patterns. The absence-means-zero convention is used by Redis INCR, DynamoDB atomic counters, and similar systems. |
| cacheTtl on reads | Documented Cloudflare best practice for reducing KV read latency at edge PoPs. |
| Keep idempotency in KV | Exactly-once semantics require persistent distributed state. KV is the correct choice here. |
| Keep KV over D1 for rate limiting | KV has lower latency (~10-50ms) than D1 (~50-200ms) and automatic TTL expiration. Rate limiting is a canonical KV use case. |
