# Galley (recipes and provisions)

**Galley** is the recipe library for the **active group**.

## Recipes vs provisions

- **Recipes** are multi-ingredient meals with directions and optional equipment and tags.
- **Provisions** are simple **single-ingredient** items (for example a piece of fruit) for quick planning and snacks.

Both can appear in the **Manifest** and in cookable-meal matching. See *Matching cookable meals*.

## Actions

- **Create recipe or provision** — Use **Galley → New** (or equivalent) to enter title, ingredients, units, servings, and directions. Link ingredients to Cargo when possible for better cook and shopping accuracy.
- **Edit meal** — Open a meal and **Edit** ingredients, tags, times, or narrative fields. When nutrition is enabled, detail and edit can show per-serving energy/macros (from ingredients or a stored snapshot)—see *Nutrition overview* and *Editing nutrition*.
- **Delete meal** — Remove the meal from Galley (confirm when prompted).
- **Toggle active for Supply** — Mark meals to include in Supply sync. Selection bars show counts.
- **Clear selections** — Clear all active meal selections for Supply.
- **Cook / consume** — Deduct ingredients from Cargo for the chosen **servings**. Semantic matching links ingredient names to pantry lines. If stock is short, confirm before cooking with what’s available (short-stock confirm). When **nutrition-cook-log-split** is on for your account, Cook also places the meal as *Prepared* on **today’s Manifest** (reusing an uncooked plan row when present) and may offer **Log my serving** for personal intake—same plate-up as Manifest Eat. Flags off: Cargo-only cook (no Manifest write).
- **Cargo Quick Eat** — From Cargo (when enabled), eating a pantry item auto-uses a linked provision and always lands as today’s Manifest **snack** with silent partial deduct (no short-stock confirm sheet).
- **Add to Manifest** — When cook/log-split is on, schedule this meal via Manifest Add-to-plan with meal and day prefilled; you confirm slot and Add. Hidden when the flag is off.
- **AI generate** — Propose recipes from your pantry. Cost: see *AI meal generation* and *AI credits explained* (typically **2 credits**).
- **URL import** — Import a recipe from an HTTPS page, social post, or photo into Galley. Cost: see *Import a recipe from a URL* and *AI credits explained* (typically **3 credits**).
- **Export / import** — Exchange Galley data via the app’s JSON export/import (and REST Galley import for power users).

If the create/edit flow differs, follow **on-screen** steps. Meal capacity follows the **owner’s** tier — see *Free vs Crew Member*.
