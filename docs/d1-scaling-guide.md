# D1 Scaling Guide — Ration

## Overview

Ration uses Cloudflare D1 (SQLite) as its sole database. This document
describes the D1 limits that matter at scale, how the current implementation
handles them, and the projected ceiling before architectural changes are needed.

---

## D1 Limits (Paid Tier)

| Resource | Limit | Ration Usage at 10K Users |
|---|---|---|
| Reads / day | 25 billion | ~100K / day — **0.0004%** |
| Writes / day | 50 million | ~50K / day — **0.1%** |
| Max DB size | 10 GB | Projected ~2 GB at 10K users |
| Rows read per query | Unlimited (paid) | Bounded by pagination |
| Rows written per query | Unlimited (paid) | Bounded by batch chunking |
| Max bound params per statement | 100 | Handled in `query-utils.server.ts` |

**The bottleneck at scale is not daily limits but concurrent TPS**: D1 is a
single-writer SQLite database. Under concurrent load, write transactions queue
behind the single write leader.

---

## 10K User Capacity Model

Assumptions per typical user per day:
- 3 page views × 5-10 reads each = ~20 D1 reads
- 1 mutation (meal/cargo) = ~10 write statements
- 0.5 supply syncs = ~15 write statements

| Metric | Calculation | Value |
|---|---|---|
| Daily Active Users (50%) | 10K × 0.5 | 5,000 |
| D1 reads / day | 5K × 20 | 100K |
| D1 writes / day | 5K × 25 | 125K |
| Peak TPS (spike factor 10×) | 125K / 86,400 × 10 | ~15 TPS |

**Conclusion**: Daily limits have ~1,000× headroom at 10K users. The real risk
is peak-hour write spikes (e.g., dinner time with 100-500 concurrent users
adding meals).

---

## Concurrent Write Capacity

D1's observed write throughput is approximately 50-200 write transactions per
second depending on transaction complexity. Ration's write-heavy operations:

| Operation | Statements per call | Max TPS before 1s latency |
|---|---|---|
| `createMeal` (5 ingredients) | ~7 | ~28 |
| `cookMeal` (5 ingredients) | ~5 | ~40 |
| `ingestCargoItems` (10 items) | ~12 | ~17 |
| `syncSupplyFromIngredientRows` | ~20+ | ~10 |

**Safe concurrent write floor**: ~50 simultaneous writes before noticeable
latency. Degradation starts at ~200 concurrent writes.

---

## Mitigations Implemented

### Phase 1 — Pagination
- `getCargo()` and `getMeals()` now accept `limit`/`offset` to prevent full
  table scans on page loads. UI pages cap at 200/100 rows respectively.
- `getCargoTags()` uses SQL `json_each()` instead of fetching all cargo rows.

### Phase 2 — Vectorize Batching
- Supply sync (`syncSupplyFromIngredientRows`, `addItemsFromMeal`) now calls
  `findSimilarCargoBatch()` once before the loop instead of one Vectorize API
  call per ingredient.

### Phase 3 — Query Parallelisation
- `cookMeal()` fetches meal, ingredients, and active selection in a single
  `d1.batch()` round-trip.
- `addItemsFromMeal()` fetches list, ingredients, and meal record in parallel.
- `deductCredits()` restructured to two-phase (UPDATE then INSERT) to eliminate
  orphaned ledger entries.

### Phase 4 — Indexes
- `session.user_id` index added (Better Auth lookups).
- `cargo(organization_id, expires_at)` compound index (expiry queries).

### Phase 5 — Write-on-Read Elimination
- `ensureSupplyList()` uses a LIMIT 1 fast path for the common case, avoiding
  full list fetch + possible deletes on every page visit.
- Session table purged daily via CRON (03:00 UTC) to prevent unbounded growth.

### Phase 6 — Observability
- `trackD1BatchSize()` logs batch statement counts with warnings at 75%+ of the
  ~100-statement undocumented limit.
- `trackWriteOperation()` instruments duration of every batch write.
- `handleApiError()` detects D1 contention errors and returns HTTP 503 with
  `Retry-After: 5` instead of a generic 500.

---

## Projected Ceiling

| Scale | Expected Behaviour |
|---|---|
| 1K users | Smooth — well within all limits |
| 5K users | Smooth — daily limits at ~2% |
| 10K users | Smooth at average load; spike risk at peak |
| 25K users | D1 write TPS becomes the primary constraint at peak |
| 50K+ users | Architectural evolution needed |

---

## Migration Path (when needed)

When Ration reaches 25K+ users or write latency consistently exceeds 500ms:

1. **Cloudflare Hyperdrive + Postgres** — Replace D1 with a managed Postgres
   (e.g., Neon) behind Cloudflare Hyperdrive for connection pooling at the edge.
   Schema is SQLite-compatible; Drizzle supports both dialects.

2. **Durable Objects for rate limiting** — Replace KV-based rate limiter with
   Durable Objects for strongly consistent counters.

3. **D1 read replicas** — Cloudflare is rolling out read replica support for D1.
   When available, route all read queries to replicas to reduce write leader load.

---

## References

- [Cloudflare D1 Limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Cloudflare Workers CPU limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Smart Placement](https://developers.cloudflare.com/workers/configuration/smart-placement/)
