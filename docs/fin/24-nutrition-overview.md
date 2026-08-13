# Nutrition overview

Ration can attach **energy and macro nutrients** to Cargo items and Galley meals, then use those snapshots when you plan and eat. Nutrition is rolled out behind feature flags—if you do not see panels or goals yet, the feature is not enabled for your account.

**Not medical advice.** Totals and goals are planning aids only.

## Where nutrients come from

1. **USDA match (primary)** — Ration looks up the food name in a self-hosted USDA-shaped reference database. A successful match is labelled **USDA**, typically high confidence. For Cargo ingest (scan / dock review), the match must also pass a **nutrient-profile gate**: missing energy, empty core macros with 0 kcal, or 0 kcal that disagrees with protein/fat/carbs (Atwater check) counts as a miss—not a USDA hit.
2. **Blank on miss** — Manual add, CSV import, and other non-AI paths leave nutrition **blank** when no usable USDA match is found. You can fill values later.
3. **AI estimate (AI ingest only)** — On receipt scan, URL import, and AI meal generation—when both the nutrition engine and **nutrition AI estimate** (plus the relevant AI feature) flags are on—Ration may fill a labelled **Estimated** snapshot after a USDA miss (including profile-gate rejects). Estimates carry a **confidence** score and are **not** verified until you edit them.

## Verified vs estimated

| Label | Meaning |
|-------|---------|
| USDA | Matched to the reference database; treated as verified. |
| Estimated | AI-filled on an AI ingest path; review before relying on it. |
| Override | You edited the values; stored as a user override and marked verified. |
| Blank | No snapshot yet—add or edit when you want tracking. |

## Where you see it
Composition snapshots on Cargo and Galley meals are **kitchen** data. Your goals and logged intake diary are **personal**; when cross-kitchen diary is on, day totals can span kitchens while housemates never see your kcal.


- **Cargo** — Detail and edit show a nutrition panel when the engine is on.
- **Galley** — Meal cards, detail, and edit can show per-serving energy/macros.
- **Scan review** — Proposed nutrients appear before you add items to Cargo; edit there first.
- **Manifest** — Day totals, Eat / plate-up intake logging, and a month calendar when Manifest nutrition is on. See *Macro tracking, goals, and intake*.
- **Hub** — Flight Recorder shows shared kitchen logistics (not personal kcal).
- **Settings** — Personal daily goals when goals are enabled. See *Editing nutrition* for how to correct values.

## Related

- *Macro tracking, goals, and intake* — Goals, Eat, calendar retention, Flight Recorder.
- *Editing nutrition* — Scan review, Cargo edits, user overrides.
- *Data, privacy, and deletion* and `/legal/privacy` — Retention and erasure.
