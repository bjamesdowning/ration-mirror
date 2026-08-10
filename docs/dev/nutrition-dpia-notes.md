# Nutrition features — DPIA / consent notes

Short processing notes for personal nutrition goals and Manifest Eat intake (GDPR Art. 9 special-category risk). Not a substitute for a formal DPIA when broadening rollout beyond dogfood.

## Data processed

| Data | Storage | Purpose | Legal basis |
|------|---------|---------|-------------|
| Personal daily goals (kcal + macros) | D1 `nutrition_goal` (versioned) | Goals vs reality on Manifest / summary API | Explicit, versioned goals-purpose consent recorded through the privacy API |
| Intake from Manifest Eat (plate-up / Log my serving) | D1 `nutrition_intake` | Day totals, calendar history (user-scoped) | **Explicit, versioned** intake-purpose consent recorded through the privacy API after the full statement is shown; not implied by Cook, Prepared status, or goals alone; erase with account; never copied into shared `kitchen_event` payloads |
| Food composition snapshots on cargo/meals | JSON on `cargo` / `meal` | Pantry + recipe display | Legitimate interest / contract — USDA-shaped reference, not clinical advice |
| AI nutrient estimates | Same snapshots (`source=ai_estimate`) | Fill USDA misses on AI ingest only | Same as AI ingest; labelled unverified |
| Live FDC search queries (optional) | Ephemeral HTTP to api.nal.usda.gov | Miss fallback after local alias/FTS | Food **names only** — no user ids/emails; results cached in KV / NUTRITION_DB |

## Controls

- Feature flags default **off**; production dogfood via Flagship `userId` allowlist only (see [feature-flags.md](feature-flags.md)), plus compound `ios` + `clientVersion` ≥ `1.3.25` for Cook/Eat split — see [nutrition-rollout.md](nutrition-rollout.md).
- Goal and intake upserts require active ledger consent and reject legacy inline consent fields; clear/erase controls remain available separately.
- Cook never writes personal intake. Nutrition mutations use request-level operation records for atomic, idempotent replay without storing nutrient values in audit rows.
- Intake retention **~396 days** (aligned with kitchen events); purge on account erase.
- No HealthKit / clinical claims; UI and help copy state estimates are not medical advice.
- Self-hosted USDA-shaped `NUTRITION_DB` is the hot path (curated `food_alias` + FTS). Optional live FDC API (`USDA_FDC_API_KEY`) is miss-only and name-only.
## Operator checklist before broaden

1. Confirm Flagship defaults remain off until intentional percent/default-on rollout.
2. Confirm privacy policy + help articles (`docs/fin/24`–`26`) are live.
3. Sync Copilot AI Search after help article deploy.
4. Prefer `clientVersion` targeting if cutting over mixed iOS fleets (see `buildFlagContext` / `X-Ration-Client`).
