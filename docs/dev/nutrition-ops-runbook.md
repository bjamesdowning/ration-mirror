# Nutrition operations runbook

Operator playbook for dogfood / App Review nutrition. Flags stay **off** until the checklist below is green. See also [nutrition-rollout.md](./nutrition-rollout.md).

## Pinned FDC dataset

1. Place verified Foundation + SR Legacy (+ optional FNDDS/survey) CSV folders under `nutrition-db/raw/`.
2. Fill `archiveSha256` (and URLs/dates) in `nutrition-db/releases/current.json`.
3. `bun run db:nutrition:import:generate` → review `nutrition-db/generated/MANIFEST.txt` + `release-manifest.json`.
4. Apply to a **staging** D1 only (`--apply-remote --db=ration-nutrition-dev`). Never clear/refill the live production binding.
   - Import applies `schema.sql` then ensures `food_nutrient.energy_nutrient_id` / `salt_derivation` exist (older DBs lack these; `CREATE TABLE IF NOT EXISTS` does not upgrade).
   - A failed apply after `00-clear.sql` leaves the DB empty — fix schema drift and re-run the full import, then re-seed aliases.
5. Apply alias table + curated staples (after food rows exist):
   ```bash
   wrangler d1 execute ration-nutrition --remote --file=nutrition-db/migrations/0002_food_alias.sql
   wrangler d1 execute ration-nutrition --remote --file=nutrition-db/seed-food-alias.sql
   # same for ration-nutrition-dev / --local as needed
   ```
6. Smoke: resolve `whole milk` / `olive oil` / `chicken breast` via alias; confirm cargo shows **Per 100 g**.
7. Promote by binding change + set `NUTRITION_DATASET_SNAPSHOT_ID` in `app/lib/nutrition/constants.ts` to the emitted snapshot id.
8. **Never** enable `nutrition-engine` for reviewers against `seed-minimal.sql`.

## Live FDC search fallback (optional)

1. Create an API key at https://api.data.gov/signup/
2. `wrangler secret put USDA_FDC_API_KEY` (prod) and `--env dev` for `ration-dev`
3. Redeploy Workers. Fallback runs only after alias + local FTS miss; sends **food names only** (no PII).

## Queue / DLQ

Queues (create in Cloudflare dashboard before enabling async). Wrangler binds by **name**; IDs are ops reference only:

| Env | Queue | Queue id | DLQ | DLQ id |
|-----|-------|----------|-----|--------|
| prod | `ration-nutrition-recompute` | `c8ab6a25927a4feda10db6390630092c` | `ration-nutrition-recompute-dlq` | `031067650ce940d087369b93f0c8bac0` |
| dev | `ration-nutrition-recompute-dev` | *(create)* | `ration-nutrition-recompute-dlq-dev` | *(create)* |
| local | `ration-nutrition-recompute-local` | *(local only)* | `ration-nutrition-recompute-dlq-local` | *(local only)* |

Symptoms:

- **Oldest pending job > 120s**: check consumer logs, D1 contention, Flagship `nutrition-async-recompute` still on for cohort.
- **DLQ growth**: inspect wake payload validity; lease claim conflicts; FDC DB binding missing (`unavailable` resolves).
- **Queue send failures**: mutations still succeed; minute cron redispatches due outbox rows.

Recovery:

1. Confirm `NUTRITION_RECOMPUTE_QUEUE` binding + consumer registered in `AI_QUEUE_HANDLERS`.
2. Leave user edits alone — repair cron wakes due/failed/expired-lease jobs.
3. Kill-switch: disable `nutrition-async-recompute` (sync fallback remains if engine on).

## Ambiguous intake / undo replay

- Clients must retry with the **same** `operationKey` / item idempotency keys after `timeout_ambiguous` or 5xx.
- Stale undo → `409 undo_conflict` (token already consumed or window expired).
- Do not mint a new operation key to “force” completion — that creates a second write.

## Consent / audit failures

- Grant/withdraw/erase failures emit `nutrition_consent` metrics (`denied` / `grant` / `withdraw` / `erase`) without statement text.
- Agent reads fail closed if access audit cannot persist.
- Withdrawal is user-global across organizations; clear private iOS caches on withdraw/logout.

## Summary latency

- Target p95 &lt; 150 ms for ≤93-day ranges.
- Metric blob: `nutrition_summary_duration` buckets `lt50` / `lt150` / `lt500` / `gte500`.
- If elevated: confirm `nutrition_intake_user_history_idx` present; check range caps; avoid client polling loops.

## Mobile Hub / Manifest decode incident

1. Confirm the TestFlight build and deployed Worker version are the same release; Workers Builds can silently roll back after a failed deploy.
2. Confirm main-D1 migrations are current before serving code that reads new nutrition columns: `bun run db:migrate:prod`.
3. Reproduce from a **DEBUG** device build and collect only `[RationAPI]` decode diagnostics. Hub diagnostics list JSON paths and numeric kinds, never response values, authorization headers, or personal nutrition data.
4. Treat a Foundation message such as `Number 1.4 is not representable in Swift` as a decimal reaching an iOS `Int` field, not invalid JSON. Inspect the reported path, then repair or omit the malformed optional Hub card/server value.
5. Re-check the shared Hub wire contract after schema or model edits: `bunx vitest run app/lib/schemas/mobile/__tests__/hub-populated-contract.test.ts` and XCTest `HubPopulatedContractTests` against `hub-populated.json`.
6. A cold Manifest decode failure must show its retry state. If it instead looks empty, do not add duplicate plan entries—first retry after verifying the deployed Worker and migration.
7. Enable nutrition in dependency order for the same platform cohort: `nutrition-engine` → `nutrition-manifest` → `nutrition-cook-log-split`; `nutrition-intake-notes` is additive and does not enable Eat.

## Alerts (initial — configure in Cloudflare / Grafana)

| Signal | Warn | Critical |
|--------|------|----------|
| Oldest recompute job age | &gt;120s for 5m | &gt;300s |
| Pending backlog | &gt;1000 for 5m | sustained |
| DLQ rate | any sustained | — |
| Intake conflict rate | &gt;1% | — |
| Summary p95 | &gt;150ms | — |
| Resolve `unavailable` | above baseline | — |
| Consent/audit write failures | any spike | — |

## Release dashboard (checklist)

- Enabled cohort + `clientVersion` gate
- Resolve hit / miss / abstain / unavailable
- Summary duration buckets + errors
- Intake committed / replayed / conflict
- Queue lag / backlog / retry / DLQ
- Consent grant vs withdraw (no health values)
- iOS cached / current / error (from dogfood notes until client metrics ship)
