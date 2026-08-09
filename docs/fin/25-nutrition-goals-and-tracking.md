# Nutrition goals and tracking

When nutrition goals and Manifest nutrition are enabled for your account, Ration can compare daily intake to optional personal targets and keep a rolling history on Manifest.

**Not medical advice.** Goals and day totals are optional planning aids, not clinical guidance.

## Personal goals

Open **Hub → Settings → Preferences** (or the nutrition goals section when shown). Set daily energy (kcal) and optional macros (protein, carbs, fat, fiber). Saving a goal requires **explicit consent** to store health-related personal data. You can clear the goal at any time.

Day views and summaries can show consumed totals versus your active goal when both intake logging and goals are available.

## Manifest Eat (plate-up)

On Manifest, **Eat** / consume can open a **plate-up** step when Manifest nutrition is on:

- Choose how many **servings** you ate (portion of the planned meal).
- Confirm whether to **log nutrition** for that plate-up (default on when the feature is available).
- Ration deducts pantry stock as usual and records intake from the meal’s nutrition snapshot scaled to portions.

You can still consume without logging intake when the UI offers that choice.

## Day totals and calendar

- **Day view** — Lists intake rows for the active day (energy and macros when present).
- **Month calendar** — Tap the Manifest date-range control to open an overlay: green dots for planned meals, markers for days with logged intake. Dates older than about **13 months** are muted with a note that history is kept for 13 months.

Intake rows older than roughly **396 days (~13 months)** are purged on the same schedule as other kitchen-event cleanup. Account purge removes goals and intake with your data.

## Flight Recorder

The Hub **Flight Recorder** widget shows recent kitchen activity (cooks, docks, expiries). Shared events show preparation logistics only — **personal kcal and plate-up servings are not shown** to other household members. Your private intake history lives on nutrition summary/day views.

## Agents

Ask Ration and MCP can read a date-range summary and set or clear goals when flags and scopes allow (`get_nutrition_summary`, `set_nutrition_goal`, `clear_nutrition_goal`). Consume tools may accept portions and a log-nutrition option. See *MCP tools reference*.

## Related

- *Nutrition overview* — USDA vs estimate vs blank.
- *Manifest (meal plan)* — Consume and calendar controls.
- *Hub dashboard and settings* — Goals UI and widgets.
