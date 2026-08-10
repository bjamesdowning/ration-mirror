# Nutrition operations runbook

Operator playbook for dogfood / App Review nutrition. Flags stay **off** until the checklist below is green. See also [nutrition-rollout.md](./nutrition-rollout.md).

## Pinned FDC dataset

1. Place verified Foundation + SR Legacy CSV folders under `nutrition-db/raw/`.
2. Fill `archiveSha256` (and URLs/dates) in `nutrition-db/releases/current.json`.
3. `bun run db:nutrition:import:generate` → review `nutrition-db/generated/MANIFEST.txt` + `release-manifest.json`.
4. Apply to a **staging** D1 only (`--apply-remote --db=ration-nutrition-dev`). Never clear/refill the live production binding.
5. Smoke: resolve milk / olive oil / known abstentions; confirm null macros stay null.
6. Promote by binding change + set `NUTRITION_DATASET_SNAPSHOT_ID` in `app/lib/nutrition/constants.ts` to the emitted snapshot id.
7. **Never** enable `nutrition-engine` for reviewers against `seed-minimal.sql`.

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
