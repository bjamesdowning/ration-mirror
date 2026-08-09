# Nutrition foundation hardening — operator rollout

Rollout order (Flagship `userId` allowlist first; dashboard flags stay **off** until dogfood):

1. `nutrition-engine`
2. `nutrition-async-recompute` (queue stub — leave off until queue binding ships)
3. `nutrition-manifest`
4. `nutrition-cook-log-split` (requires migration `0042_*` applied)
5. `nutrition-goals`
6. `nutrition-ai-estimate`

## Privacy

- Shared `kitchen_event` payloads never include personal kcal. Operator redaction: `scripts/redact-legacy-nutrition-events.ts`.
- Account purge redacts nutrition fields on events before anonymizing `userId`.

## Schema

Apply `drizzle/0042_*.sql` to production D1 **before** enabling `nutrition-cook-log-split` (`bun run db:migrate:prod`).

## Rollback

Disable Flagship flags. Do not reverse additive migrations.

## DPIA

Broad intake consent rollout remains blocked pending counsel confirmation — see `docs/dev/nutrition-dpia-notes.md`.
