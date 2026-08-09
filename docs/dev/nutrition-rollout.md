# Nutrition foundation hardening — operator rollout

## Dogfood enablement order

1. Apply D1 migration `0044_kind_true_believers` (unique active intake per user/org/entry) — `bun run db:migrate:prod` (operator-owned; do not run from CI casually).
2. Deploy Workers (web + mobile API) that include Cook/Eat split routes.
3. Ship / verify TestFlight **iOS 1.3.23** (build with Cook/Prepared/Eat UI).
4. Enable Flagship with a **compound** rule: `userId` allowlist **+** `ios` client **+** `clientVersion` ≥ `1.3.23` (never turn nutrition **on** via `FEATURE_FLAG_OVERRIDES`).

Flag enablement sequence once the above are ready (dashboard flags stay **off** until dogfood):

1. `nutrition-engine`
2. `nutrition-async-recompute` (queue stub — leave off until queue binding ships)
3. `nutrition-manifest`
4. `nutrition-cook-log-split` (requires `0044_*` applied)
5. `nutrition-goals`
6. `nutrition-ai-estimate`

## Privacy

- Shared `kitchen_event` payloads never include personal kcal. Operator redaction: `scripts/redact-legacy-nutrition-events.ts`.
- Account purge redacts nutrition fields on events before anonymizing `userId`.
- Personal intake requires **explicit** first-use consent (checkbox / `consent: true`) — not implied by Cook or by enabling goals.

## Schema

Apply `drizzle/0044_*.sql` to production D1 **before** enabling `nutrition-cook-log-split` (`bun run db:migrate:prod`).

## Rollback

Disable Flagship flags. Do not reverse additive migrations.

## DPIA

Broad intake consent rollout remains blocked pending counsel confirmation — see `docs/dev/nutrition-dpia-notes.md`.
