# Nutrition foundation hardening — operator rollout

## Compatibility contract (App Store `1.3.17` + current web)

One production API serves everyone. Safety comes from **flags default off** + **platform/version gates**, not from a separate backend. A `userId` allowlist is **not** required.

| Client | Backend after this deploy (flags off) | Nutrition UI / APIs |
|---|---|---|
| App Store iOS **`1.3.17`** | Keep working: Manifest, Galley Cook, Consume, **KV undo**, cargo | Off — no Eat / goals / summary chrome |
| Current production web | Same as above | Off until Flagship `clientPlatform` `web` is on |
| TestFlight / App Store iOS **`≥ 1.4.x`** | Same API; nutrition when Flagship platform + version rules match | On when those rules evaluate true |
| Post–App Review App Store cut | Same API; keep `clientVersion` ≥ `1.4.0` (or the released floor) | On as users update |

**Hard rules**

- Never enable nutrition with `FEATURE_FLAG_OVERRIDES` (that would hit every client).
- Missing `clientVersion` on iOS → evaluate **off** (fail closed).
- iOS sends `X-Ration-Client: ios/<MARKETING_VERSION>`; web Flagship context pins `web` + server `APP_VERSION`.
- Undo: cook/consume still use short-lived KV tokens; Eat uses D1 `operationId`. Flag-off / unknown tokens **must** fall through to KV (do not 403).

## Phased path: TestFlight → App Review → public

### Phase A — Backend ready, flags still off (safe for `1.3.17`)

1. Create Cloudflare Queues + DLQ for `NUTRITION_RECOMPUTE_QUEUE` (prod/dev as needed); leave `nutrition-async-recompute` **off** until consumer smoke passes.
2. Apply main D1 migrations **`0045`–`0052`** (`bun run db:migrate:prod`) **before or with** Worker deploy — meal queries select new columns; `0052` rebuilds `nutrition_intake` (nullable org SET NULL + name snapshots).
3. Deploy Workers (web + mobile API) at web **`≥ 1.8.10`**. Confirm App Store `1.3.17` smoke: login, Manifest Consume, Galley Cook, **undo toast**.
4. Pin / promote verified FDC nutrition DB (never App Review on `seed-minimal.sql`). Optional until `nutrition-engine` dogfood.

### Phase B — TestFlight dogfood (platform / version targeting)

1. Archive TestFlight iOS **`≥ 1.4.0`** (build **`≥ 103`**). Testers install that build only.
2. Keep Flagship **default variation off** for each nutrition flag. Enable with **platform** (and iOS version) rules — **no `userId` allowlist required**:
   - **iOS:** `clientPlatform` equals `ios` **and** `clientVersion` ≥ `1.4.0` (or the shipping `1.4.x` floor)
   - **Web:** `clientPlatform` equals `web` (optionally also `clientVersion` ≥ shipping `APP_VERSION`)
   - **MCP / Copilot:** `clientPlatform` equals `mcp` or `copilot` (platform on; optional web `APP_VERSION` gate)
3. Enable flags in order (dashboard only; stay off for everyone else until the matching rule hits):
   1. `nutrition-engine`
   2. `nutrition-async-recompute` (after queue consumer verified)
   3. `nutrition-manifest`
   4. `nutrition-cook-log-split`
   5. `nutrition-goals`
   6. `nutrition-cross-org-diary` (after manifest/goals; user-global diary — see [tenancy-classes.md](tenancy-classes.md))
   7. `nutrition-ai-estimate` (last; scan-review AI only)

After fin help edits for cross-org diary, sync Copilot AI Search ([copilot-ai-search.md](copilot-ai-search.md)) so Ask Ration matches product copy.

**Hub widgets:** Once `nutrition-manifest` and/or `nutrition-goals` are on, Hub exposes **Daily Fuel** (`nutrition-today`) and **Fuel Trends** (`nutrition-trends`) on `full`/`cook` presets (flag-gated out of layout when both flags are off). Tapping either opens Nutrition Goals in Preferences (goals flag required on Hub).

5. Iterate fixes on TestFlight; bump iOS patch/minor + web as needed. Keep App Store binary on the **same** API with flags evaluating off for `1.3.17` / pre-`1.4.0` clients.

### Phase C — App Review

1. Freeze a TestFlight build for review (note exact `MARKETING_VERSION` + `CURRENT_PROJECT_VERSION`).
2. Ensure the review build meets the `clientVersion` floor (`≥ 1.4.0`). Nutrition may be visible to reviewers on that binary when Flagship platform/version rules are on — see [app-review-notes.md](../../plans/app-review-notes.md).
3. Use verified FDC data — not the smoke seed.
4. Submit; keep public App Store `1.3.17` users on flags-off behavior.

### Phase D — Public release (scheduled)

1. Apple approves → choose release time (phased or manual).
2. When the new binary goes live, keep **`clientVersion` ≥ the released App Store marketing version** (and web `clientPlatform` `web` for browser). No `userId` allowlist step is required.
3. Users still on `1.3.17` / pre-floor builds remain flags-off until they update; as they update they get nutrition without a second deploy.
4. Kill-switch: disable Flagship flags (no migration rollback).

## Dogfood enablement checklist (short)

1. Apply D1 migrations through `0050_dark_havok` — operator-owned; not from CI without approval.
2. Deploy Workers that include Cook/Eat, Galley bridge, and **undo KV fallback**.
3. Ship / verify TestFlight **iOS ≥ `1.4.0`**. Older binaries must not be targeted.
4. Enable Flagship with **default off** + platform rules (iOS: `ios` + `clientVersion` ≥ `1.4.x`; web: `web` on; mcp/copilot: platform on). A `userId` allowlist is **not** required. Never use `FEATURE_FLAG_OVERRIDES` to turn nutrition **on**.

**Prefer default off + version/platform gate**, not default on with exclusions for old clients.

## Galley ↔ Manifest (cook-log-split)

When `nutrition-cook-log-split` is on for the client cohort:

- **Cook meal** (Galley) ensures/reuses a plan entry for the local day, prepares it (Cargo once), then may offer **Log my serving** if `nutrition-manifest` is also on.
- **Add to Manifest** opens Add-to-plan with meal + day prefilled; user confirms (no silent insert).
- Flags **off**: Galley Cook stays cargo-only; Add to Manifest is hidden — no disruption for 1.3.17 and other untargeted builds.

## Privacy

- Shared `kitchen_event` payloads never include personal kcal. Operator redaction: `scripts/redact-legacy-nutrition-events.ts`.
- Account purge redacts nutrition fields on events before anonymizing `userId`.
- Personal intake requires **explicit, versioned** consent through the privacy API after the user reviews the full statement — not an inline write field, and not implied by Cook, Prepared status, Add to Manifest, or enabling goals.

## Dates and capability policy

- Date-only fields (`from`/`to`/`asOf`/`effectiveFrom`) are local proleptic-Gregorian calendar labels validated as real calendar days (impossible dates like `2026-02-31` fail). Inclusive ranges; summary `goalAsOf` equals `to`.
- Flagship evaluation uses trusted surfaces: web forces `web` + server `APP_VERSION`; mobile forces `ios` (header version is rollout metadata only); MCP/Copilot use server-owned `mcp`/`copilot` + `APP_VERSION`. Headers cannot switch platforms for auth/consent.
- Effective capabilities gate children on parents (`manifest` requires `engine`; `cookLogSplit` requires `manifest`; AI/async require engine + server eligibility). Clients should prefer effective capabilities over raw child flags.
- Additive `nutritionV2` / `goalAsOf` fields appear on summary and resolve responses; legacy `carbG` shapes remain for the fleet window.

## MCP / Copilot (agent dogfood)

Workers expose Cook/Eat parity tools over shared libs (`cook_manifest_entries`, `log_manifest_intake`, `clear_manifest_intake`, `list_nutrition_intakes`, plus summary/goals). Agents evaluate Flagship via `buildAgentFlagContext`: `clientPlatform` `mcp`|`copilot` + web `APP_VERSION` (never a faked `ios`/`1.4.0` header). The **`ration-mcp` Worker must bind Flagship** (`FLAGS` in `wrangler.mcp.jsonc`) — without it, nutrition flags always evaluate off regardless of dashboard rules. Redeploy with `bun run deploy:mcp` after Flagship binding changes.

Dogfood agents with nutrition flags **on for platform** (`clientPlatform` in `{mcp,copilot}`; optional `clientVersion` ≥ current web `APP_VERSION`). A `userId` allowlist is not required. Nutrition tools require explicit `mcp:nutrition:read` / `mcp:nutrition:write`. Legacy broad `mcp` expands only to pre-nutrition kitchen scopes (never nutrition); existing keys are rewritten on authenticate. New API keys cannot create blanket `mcp`. OAuth consent must re-grant nutrition scopes (and Connected Agent / `agent_processing` consent) before agents can read or write health data. Copilot may include nutrition scopes in its capability set, but empty-text intent still exposes only core tools.

Write timeouts return `timeout_ambiguous` with the same `operationKey` — clients must retry/query status with that key, never mint a new one.

Rollback for agents is the same as app: disable nutrition Flagship flags (fail-closed).

## Schema

Apply `drizzle/0044_*.sql` through `drizzle/0050_*.sql` in order to production D1 **before** enabling hardened nutrition capabilities. Production migration remains an explicit operator action.

## Ops runbook

Detailed FDC pin, queue/DLQ, undo replay, and alert checklist: [nutrition-ops-runbook.md](./nutrition-ops-runbook.md).

## Async recompute (Checkpoint 6)

- Producer upserts `nutrition_recompute_job` and bumps `meal.nutrition_revision` / `nutrition_status=pending` without touching `meal.updated_at`.
- Queue wake payload is `{ schemaVersion: 1, type: "nutrition.recompute.wake", jobKey, sentAt }` only — no org/user/nutrient fields.
- Consumer claims a 120s lease, recomputes, and commits only when source revision + lease still match.
- Minute cron redispatches due/failed/expired-lease jobs (bounded). Queue send failures leave the outbox repairable.
- With the flag off (or queue unbound), meal writes keep the synchronous recompute fallback.

## USDA / FDC reference DB (Checkpoint 5)

- Do **not** enable `nutrition-engine` for App Review against `nutrition-db/seed-minimal.sql` (test-only approximate values).
- Pin Foundation + SR Legacy via `nutrition-db/releases/current.json` (official URL, publication date, `archiveSha256`).
- Generate SQL with `bun run db:nutrition:import:generate` (streams CSVs; writes `nutrition-db/generated/` + snapshot hash). Remote apply refuses missing archive checksums.
- Promote by binding a verified staging D1 — never clear/refill the active production nutrition database.
- Matcher `1.4.0`: curated `food_alias` before FTS; FTS + bm25 (limit 80) plus fragile-head primary-prefix bank; optional live FDC search miss fallback; no miss poison on FTS throw or ranker abstention amid noise; inverted OCR↔USDA label scoring; peer-dedupe margin; fragile modifiers blocked for bare commodity heads. Medium-quality matches attach in scan review / propose; automated hits are `high`, never `verified`. Org ledger never treats `review`+null `fdcId` as a hard miss. Cargo stores density (`per100g`); meals reuse cargo USDA/AI/override density when matched.
- After a verified import, set `NUTRITION_DATASET_SNAPSHOT_ID` in `app/lib/nutrition/constants.ts` to the emitted snapshot id before dogfood.

## Rollback

Disable Flagship flags. Do not reverse additive migrations.

## DPIA

Broad intake consent rollout remains blocked pending counsel confirmation — see `docs/dev/nutrition-dpia-notes.md`.
