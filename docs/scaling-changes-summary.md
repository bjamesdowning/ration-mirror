# Scaling Changes — Summary & Local Testing

## What Changed Fundamentally

These changes target safe operation at **~10,000 users** without redesigning the stack. The main idea: **cap unbounded data, batch external calls, reduce round-trips, and add visibility.**

---

### 1. **Pagination (Unbounded → Bounded)**

| Before | After |
|--------|--------|
| `getCargo()` and `getMeals()` returned **all** rows for an org. | They accept optional `{ limit, offset }`. UI pages (Cargo, Galley) pass explicit limits (200 / 100). Exports and scan still get full data by omitting options. |
| `getCargoTags()` selected **every cargo row** and extracted tags in JS. | One SQL query using `json_each(c.tags)` returns only distinct tag strings — no full row payload. |

**Why it matters:** Large orgs (500–2000+ items) no longer load entire tables into Worker memory on every page load.

---

### 2. **Vectorize: N Calls → 1 Batch**

| Before | After |
|--------|--------|
| Supply sync and “add items from meal” called `getAvailableCargoQuantity()` in a **loop**. Each call could hit `findSimilarCargo()` → one Vectorize API call per ingredient. | Before the loop, a single `findSimilarCargoBatch(ingredientNames)` runs. The loop uses a **pre-fetched map**; no per-ingredient Vectorize calls. |

**Why it matters:** A 20-ingredient meal went from up to 20 sequential Vectorize calls to one batched embedding + parallel queries. Supply sync and “add from meal” are much faster.

---

### 3. **Fewer DB Round-Trips**

| Before | After |
|--------|--------|
| `cookMeal()`: 3 sequential reads (meal → selection → ingredients). | One `d1.batch()` fetches meal + ingredients + selection together. |
| `addItemsFromMeal()`: 3 sequential reads (list → ingredients → meal). | `Promise.all()` fetches list, ingredients, and meal in parallel. |
| `deductCredits()`: One batch (UPDATE + INSERT). If UPDATE matched 0 rows, a **second** call deleted the orphaned ledger row. | Two steps: (1) UPDATE with `WHERE credits >= cost`; (2) INSERT ledger **only if** UPDATE matched. No orphan, no cleanup DELETE. |

**Why it matters:** Lower latency per request and no brief inconsistent state in the ledger.

---

### 4. **New Indexes (Drizzle-Generated)**

| Index | Table | Purpose |
|-------|--------|--------|
| `session_user_id_idx` | `session(user_id)` | Faster session lookups by Better Auth on every request. |
| `cargo_org_expires_idx` | `cargo(organization_id, expires_at)` | `getCargoStats()` and `getExpiringCargo()` use the index instead of full table scans. |

**Why it matters:** Session and expiry queries scale with log N instead of full scans.

---

### 5. **Write-on-Read Reduced**

| Before | After |
|--------|--------|
| `ensureSupplyList()` loaded **all** supply lists for the org and sometimes ran UPDATE/DELETE on every visit. | **Fast path:** one `SELECT ... WHERE name = 'Supply' LIMIT 1`. If a row exists, return it (no writes). Slow path (create/cleanup) only when no list exists or name is wrong. |
| Session table had no cleanup. | A **scheduled handler** runs daily at 03:00 UTC and deletes `session WHERE expires_at < now()`. |

**Why it matters:** Normal supply page loads are read-only; session table stops growing unbounded.

---

### 6. **Resilience & Observability**

| Change | What it does |
|--------|----------------|
| **D1 contention handling** | `handleApiError()` detects D1/timeout-style errors and returns **503** with `Retry-After: 5` and a clear message instead of a generic 500. |
| **Batch size telemetry** | `trackD1BatchSize(operation, statementCount)` logs batch size and **warns** when within 75% of the ~100-statement batch limit. |
| **Write timing** | `trackWriteOperation(operation, fn)` wraps `createMeal`, `cookMeal`, and `ingestCargoItems` batch runs and logs duration (and failures). |

**Why it matters:** You can see when batches get large or slow; users get a retryable response under load.

---

### 7. **Documentation & Rules**

- **`docs/d1-scaling-guide.md`** — D1 limits, 10K user model, mitigations, ceiling, migration path.
- **`docs/monitoring-runbook.md`** — What to watch, log events, D1/CRON/AI/Stripe checks.
- **`.cursor/rules/ration-master.mdc`** — Rule: always use `bun run db:generate` for migrations; never hand-write migration SQL.

---

## How to Test Locally and See Differences

### Prerequisites

- `bun` installed  
- `.dev.vars` with required secrets (see project README)  
- Local or remote D1: `bun run db:migrate:dev` if using remote dev DB  

### 1. Run the app

```bash
# Local dev (Vite + local D1)
bun run dev

# Or remote dev (real D1/KV/Vectorize in dev env)
bun run dev:remote
```

Use **remote dev** if you want to exercise Vectorize, KV, and real D1; use **local dev** for quick UI/flow checks.

---

### 2. Pagination (Cargo & Galley)

**Cargo page (`/hub/cargo`)**

- Before: One request returned every inventory item.  
- Now: Request uses `?page=0` (default) and the loader passes `limit: 200`.  
- **How to see it:** Add 250+ cargo items (or use an org that already has many). Reload `/hub/cargo`. Only the first 200 show; URL can support `?page=1` for the next page (if you add UI for it). Compare network: response size should cap instead of growing with total items.

**Galley page (`/hub/galley`)**

- Before: One request returned every meal.  
- Now: Loader passes `limit: 100` for meals and `limit: 200` for inventory.  
- **How to see it:** With 100+ meals, only the first 100 load. Again, response size is bounded.

---

### 3. Supply sync (Vectorize batching)

**Where:** Supply page → “Update list” or background sync from selected meals.

- Before: Each ingredient could trigger its own Vectorize call (slow under load).  
- Now: All ingredient names are sent in one `findSimilarCargoBatch()` before the loop.  
- **How to see it:** Pick a meal with 10+ ingredients and trigger “Update list” or “Add items from meal”. In remote dev, sync should complete faster and with fewer external calls (check Cloudflare dashboard for Vectorize usage if needed).

---

### 4. Cook meal (batched read)

**Where:** Galley → open a recipe → “Cook” (deduct ingredients).

- Before: Three sequential D1 reads.  
- Now: One batch read for meal + ingredients + selection.  
- **How to see it:** No visible UI change; you can compare timing in logs/telemetry. Functionally, cook should behave the same but with lower latency.

---

### 5. Credit deduction (no orphan ledger)

**Where:** Any action that spends credits (e.g. scan, generate meal).

- Before: On race/low balance, a ledger row could be inserted then cleaned up in a second call.  
- Now: UPDATE runs first; ledger INSERT only if balance was sufficient.  
- **How to see it:** Hard to trigger intentionally; under concurrency or repeated “insufficient credits” you should no longer see orphan ledger rows. Check DB: `SELECT * FROM ledger WHERE amount < 0 ORDER BY created_at DESC LIMIT 20` and confirm no “stray” rows without a matching balance change.

---

### 6. Supply list fast path (ensureSupplyList)

**Where:** Every load of `/hub/supply` (and any code that calls `getSupplyList` → `ensureSupplyList`).

- Before: Fetched all lists and sometimes ran UPDATE/DELETE.  
- Now: Single `SELECT ... WHERE name = 'Supply' LIMIT 1` when a list already exists.  
- **How to see it:** No UI change. With logging, you should see a single read on supply page load instead of “all lists + maybe write.” Easiest check: ensure supply page still loads and updates correctly after the change.

---

### 7. Session purge (CRON)

**Where:** Scheduled handler, 03:00 UTC daily.

- **How to see it locally:** Trigger the scheduled handler (e.g. Wrangler “test scheduled” or your dev script). After running, expired sessions should be gone:  
  `SELECT COUNT(*) FROM session WHERE expires_at < unixepoch();` → 0 after purge.  
  Optionally create an expired session, run the handler, then confirm it’s deleted.

---

### 8. D1 contention (503 + Retry-After)

**Where:** Any API that hits D1 when the DB is overloaded or times out.

- **How to see it:** Simulate by temporarily making D1 slow or failing (e.g. invalid query or timeout in dev). The API should return **503** with a body like `{ "error": "The server is under heavy load...", "code": "server_busy" }` and header `Retry-After: 5` instead of a generic 500.

---

### 9. Telemetry (batch size & write duration)

**Where:** Logs for `createMeal`, `cookMeal`, and `ingestCargoItems`.

- **How to see it:** Create a meal (with several ingredients/tags), cook a meal, and add cargo in bulk. In your logs you should see entries like `[Telemetry] d1_batch_size` and `[Telemetry] write_op_complete` with `operation`, `statement_count`, and `duration_ms`. No UI change.

---

## Quick smoke test (minimal)

1. `bun run dev` or `bun run dev:remote`.  
2. Log in, open **Cargo** and **Galley** — both load without error.  
3. Open **Supply** — list loads; run “Update list” once — no error.  
4. **Cook** one meal — deduction succeeds.  
5. Create one **new meal** with a few ingredients — save succeeds.  

If all of the above pass, the main code paths (pagination, supply batch, cook batch, write telemetry, and supply fast path) are exercised.

---

## Reference

- **Capacity and limits:** `docs/d1-scaling-guide.md`  
- **What to monitor and how:** `docs/monitoring-runbook.md`  
- **Full plan and phases:** `plans/scaling-mitigation-plan.md`
