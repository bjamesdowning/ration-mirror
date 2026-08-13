# Nutrition goals and tracking

When nutrition goals and Manifest nutrition are enabled for your account, Ration can compare daily intake to optional personal targets and keep a rolling history on Manifest.

**Not medical advice.** Goals and day totals are optional planning aids, not clinical guidance.

## Personal goals

Open **Hub → Settings → Preferences** (nutrition goals section when the flag is on). Set **only the nutrients you care about** — energy (kcal) and/or any macros (protein, carbs, fat, fiber). Empty fields stay unset and are **not** shown on Manifest. At least one nutrient is required to save. Saving requires **Macro Tracking** enabled under Feature enablement. Clear removes the active goal.

Goals are **personal to the signed-in user** (not shared with kitchen members). Each person in the same group can set different targets.

## Manifest preference strip

When both **nutrition-manifest** and **nutrition-goals** are on:

- Days show adherence-neutral progress for **set targets only** (e.g. `1,240 / 2,000 kcal · 95 / 200 g protein`).
- If you have no active goal, Manifest shows a compact **No goals** empty state with a link to Settings preferences.
- Intake can still be logged without goals; the strip stays on “No goals” until you set preferences.

Flags off: Manifest nutrition chrome is unchanged (no preference strip).

## Manifest Eat (plate-up)

**Legacy (Cook/Log split off):** On Manifest, **Eat** / consume can open a **plate-up** step when Manifest nutrition is on — choose servings, optionally log nutrition, and deduct pantry stock as usual.

**Cook / Log split (when enabled for your account):**

- **Cook** — Shared household action: deducts Cargo once and marks the plan entry *Prepared*. Does **not** write personal nutrition.
- **Log my serving** / **Edit serving** — Private to you. Opens plate-up for how many servings **you** ate; records intake from the meal’s nutrition snapshot scaled to portions.
- **Explicit Macro Tracking** — First personal log requires Macro Tracking to be enabled in Settings → Feature enablement (versioned nutrition purposes under the hood). Consent is **not** an inline Eat field and is not implied by Cook, Prepared status, or saving goals.
- **Remove my log** — Clears your personal intake for that entry without undoing Cook/Prepared.

You can Cook without ever logging a personal serving.

## Ask / MCP

When nutrition flags and consent allow, Copilot and MCP can:

- Return **remaining vs goal** on `get_nutrition_summary` (`vsGoal`; UTC calendar day, not a dinner-only slice).
- Match cookable meals with compact per-serving nutrition and an optional kcal cap.
- Log **Quick Eat** (`quick_eat_cargo`) for “I just ate X” — creates a missing pantry line, then deducts it.

Not medical advice. Agents never prescribe calorie targets.

## Galley Cook and Add to Manifest

When **nutrition-cook-log-split** is on (same Flagship cohort as Manifest Cook/Eat):

- **Galley → Cook meal** prepares a Manifest entry for **today** (household-visible) and may open **Log my serving** when **nutrition-manifest** is also on.
- **Galley → Add to Manifest** opens Add-to-plan with the meal and day set; you still confirm before it is scheduled.
- Other household members see the Prepared meal on Manifest and can log their own serving separately.

Flags off: Galley Cook does not touch Manifest; Add to Manifest is not shown.

## Day totals and calendar

- **Day view** — Lists intake rows for the active day (energy and macros when present).
- **Month calendar** — Tap the Manifest date-range control to open an overlay: green dots for planned meals, markers for days with logged intake. Dates older than about **13 months** are muted with a note that history is kept for 13 months.
- **Cross-kitchen diary** (when enabled for your account) — Day totals and history include intake you logged in **any** of your kitchens, not only the active group. Rows may show a kitchen name chip so you can tell Shared Home breakfast from a personal-kitchen snack. Other members still never see your kcal.
- **Privacy** — Goals and intake are private to the signed-in user. Shared Flight Recorder and kitchen events stay logistics-only.
- **Org delete / leave** — Leaving or deleting a shared kitchen does **not** erase your personal intake; labels may fall back to saved snapshots after the kitchen is gone.

Intake rows older than roughly **396 days (~13 months)** are purged on the same schedule as other kitchen-event cleanup. Account purge removes goals and intake with your data.

## Flight Recorder

The Hub **Flight Recorder** widget shows recent kitchen activity (cooks, docks, expiries). Shared events show preparation logistics only — **personal kcal and plate-up servings are not shown** to other household members. Your private intake history lives on nutrition summary/day views.

## Agents

Ask Ration (Copilot) and MCP can read and act on nutrition when Flagship flags and `mcp:nutrition:read` / `mcp:nutrition:write` scopes allow:

- **Reads:** `get_nutrition_summary`, `list_nutrition_intakes`; `get_meal_plan` includes `cookedAt` and the caller’s `personalIntake` when nutrition flags allow.
- **Cook (shared):** `cook_manifest_entries` or Galley `consume_meal` (Manifest bridge when **nutrition-cook-log-split** is on) — Cargo/Prepared only; never personal intake.
- **Eat (private):** `log_manifest_intake` / `clear_manifest_intake`, each with a request-level operation key; consent must already be active in Ration.
- **Goals:** `set_nutrition_goal` / `clear_nutrition_goal`.

When **nutrition-cook-log-split** is on, `consume_manifest_entries` is refused (`cook_eat_split_required`) — use Cook then Eat. Agent Flagship context uses `clientPlatform` `mcp`|`copilot` + web `APP_VERSION` (never a faked iOS version). See *MCP tools reference*.

## Related

- *Nutrition overview* — USDA vs estimate vs blank.
- *Manifest (meal plan)* — Consume / Cook / Log my serving and calendar controls.
- *Hub dashboard and settings* — Goals UI and widgets.
