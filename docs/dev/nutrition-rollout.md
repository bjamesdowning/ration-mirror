# Nutrition foundation hardening — operator rollout

## Dogfood enablement order

1. Apply D1 migration `0044_kind_true_believers` (unique active intake per user/org/entry) — `bun run db:migrate:prod` (operator-owned; do not run from CI casually).
2. Deploy Workers (web + mobile API) that include Cook/Eat split routes **and** Galley Cook→Manifest bridge.
3. Ship / verify TestFlight **iOS ≥ shipping `MARKETING_VERSION`** (Cook/Prepared/Eat UI, Galley **Add to Manifest**, Galley Cook→Manifest + plate-up). Older binaries (e.g. **1.3.17**) must not be targeted.
4. Enable Flagship with a **compound** rule: `userId` allowlist **+** `clientPlatform` equals `ios` **+** `clientVersion` ≥ shipping version (never turn nutrition **on** via `FEATURE_FLAG_OVERRIDES`).

**Prefer default off + version gate**, not default on with exclusions for old clients. Missing `clientVersion` must evaluate **off** (fail closed). iOS sends `X-Ration-Client: ios/<MARKETING_VERSION>` on API/session calls.

Flag enablement sequence once the above are ready (dashboard flags stay **off** until dogfood):

1. `nutrition-engine`
2. `nutrition-async-recompute` (queue stub — leave off until queue binding ships)
3. `nutrition-manifest`
4. `nutrition-cook-log-split` (requires `0044_*` applied) — also gates **Galley Add to Manifest** and **Galley Cook → today’s Manifest + optional Eat**
5. `nutrition-goals`
6. `nutrition-ai-estimate`

After review/release: widen the same `clientVersion` rule (drop allowlist or percent-rollout). Kill-switch: disable Flagship flags.

Web Galley parity uses the same Workers cut; target `clientPlatform` equals `web` + web `APP_VERSION` when enabling for browser clients.

## Galley ↔ Manifest (cook-log-split)

When `nutrition-cook-log-split` is on for the client cohort:

- **Cook meal** (Galley) ensures/reuses a plan entry for the local day, prepares it (Cargo once), then may offer **Log my serving** if `nutrition-manifest` is also on.
- **Add to Manifest** opens Add-to-plan with meal + day prefilled; user confirms (no silent insert).
- Flags **off**: Galley Cook stays cargo-only; Add to Manifest is hidden — no disruption for 1.3.17 and other untargeted builds.

## Privacy

- Shared `kitchen_event` payloads never include personal kcal. Operator redaction: `scripts/redact-legacy-nutrition-events.ts`.
- Account purge redacts nutrition fields on events before anonymizing `userId`.
- Personal intake requires **explicit** first-use consent (checkbox / `consent: true`) — not implied by Cook, Prepared status, Add to Manifest, or enabling goals.

## Schema

Apply `drizzle/0044_*.sql` to production D1 **before** enabling `nutrition-cook-log-split` (`bun run db:migrate:prod`).

## Rollback

Disable Flagship flags. Do not reverse additive migrations.

## DPIA

Broad intake consent rollout remains blocked pending counsel confirmation — see `docs/dev/nutrition-dpia-notes.md`.
