# Manifest (meal plan)

The **Manifest** is the meal plan calendar for the **active group**. Each day has **breakfast**, **lunch**, **dinner**, and **snack** slots. Meal cards can show advisory readiness (ingredients look available vs needs attention) based on Cargo.

## Calendar notes

- Entries may carry a **servings override** for that occurrence so shopping and cook math use a different portion than the recipe default.
- Which Manifest days feed Supply also depends on the org **planning horizon** and per-day include/exclude toggles — see *Supply (shopping list)*.

## Actions

- **Navigate week** — Move between weeks with the Manifest week controls.
- **Calendar span** — View and edit the visible plan range the UI exposes (week-focused navigation).
- **Month calendar** — When Manifest nutrition is on, tap the center date range for a month overlay (planned-meal dots, intake markers; older than ~13 months muted). See *Nutrition goals and tracking*.
- **Add entry** — Place a Galley meal into a day and slot.
- **Update entry** — Change meal, slot, or servings override for an existing entry.
- **Remove entry** — Delete a plan entry.
- **Bulk / copy** — Copy a day’s meals to other days, or bulk-add entries (including after AI plan confirm).
- **AI plan week** — Draft a week from your Galley and preferences. Runs asynchronously, returns a **preview** you confirm before bulk-add. Cost: see *AI credits explained* (typically **3 credits**). Only meals in **your** Galley are eligible.
- **Consume / Eat (legacy)** — Mark selected plan entries as cooked and deduct matched ingredients from Cargo. When matching is uncertain, the system prefers **not** to subtract the wrong item. With Manifest nutrition on, a **plate-up** step can ask portions and whether to log intake; day view shows that day’s totals.
- **Cook / Prepared / Log my serving (flag-gated)** — When Cook/Log split is on, **Cook** deducts Cargo once and marks the entry *Prepared* (no personal nutrition). **Log my serving** / Eat opens a private plate-up for your portions; first use requires an **explicit** intake-consent checkbox (not implied by Cook or goals). See *Nutrition goals and tracking*.
- **Personal day totals** — When cross-kitchen diary is on, day totals and intake log can include servings you logged in other kitchens; “You logged” markers on cards stay for the active kitchen only.
- **Day include / exclude for Supply** — Toggle whether each plan day contributes to Supply sync (default: included).
- **Share** — Create a **read-only** meal plan share link when the owner’s tier allows (**Crew Member**). See *Free vs Crew Member*.

If UI labels change, follow the **Manifest** screens in the app.
