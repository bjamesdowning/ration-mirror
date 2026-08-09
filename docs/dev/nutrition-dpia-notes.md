# Nutrition features — DPIA / consent notes

Short processing notes for personal nutrition goals and Manifest Eat intake (GDPR Art. 9 special-category risk). Not a substitute for a formal DPIA when broadening rollout beyond dogfood.

## Data processed

| Data | Storage | Purpose | Legal basis |
|------|---------|---------|-------------|
| Personal daily goals (kcal + macros) | D1 `nutrition_goal` (versioned) | Goals vs reality on Manifest / summary API | Explicit consent at save (`consentAt`) |
| Intake from Manifest Eat (plate-up) | D1 `nutrition_intake` | Day totals, Flight Recorder, calendar history | Consent implied by using goals/Eat while features enabled; erase with account |
| Food composition snapshots on cargo/meals | JSON on `cargo` / `meal` | Pantry + recipe display | Legitimate interest / contract — USDA-shaped reference, not clinical advice |
| AI nutrient estimates | Same snapshots (`source=ai_estimate`) | Fill USDA misses on AI ingest only | Same as AI ingest; labelled unverified |

## Controls

- Feature flags default **off**; production dogfood via Flagship `userId` allowlist only (see [feature-flags.md](feature-flags.md)).
- Goal upsert requires `consentAt`; clear goals closes open versions.
- Intake retention **~396 days** (aligned with kitchen events); purge on account erase.
- No HealthKit / clinical claims; UI and help copy state estimates are not medical advice.
- Self-hosted USDA-shaped `NUTRITION_DB` — no live third-party USDA API per lookup.

## Operator checklist before broaden

1. Confirm Flagship defaults remain off until intentional percent/default-on rollout.
2. Confirm privacy policy + help articles (`docs/fin/24`–`26`) are live.
3. Sync Copilot AI Search after help article deploy.
4. Prefer `clientVersion` targeting if cutting over mixed iOS fleets (see `buildFlagContext` / `X-Ration-Client`).
