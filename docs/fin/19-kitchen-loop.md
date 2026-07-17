# The kitchen loop

Ration’s kitchen is four surfaces that feed each other: **Cargo → Galley → Manifest → Supply**, then dock back into **Cargo**.

## The loop

1. **Cargo** — What you already have (pantry inventory). Quantities, units, domains, tags, and expiry live here. See *Cargo (pantry inventory)*.
2. **Galley** — What you can cook (recipes and provisions). Ingredients should map to Cargo for accurate cook and shopping math. Mark meals **active** when you want them on the shopping list. See *Galley (recipes and provisions)*.
3. **Manifest** — When you plan to eat (meal plan calendar). Place Galley meals into breakfast, lunch, dinner, or snack slots. Include or exclude plan days from Supply. See *Manifest (meal plan)*.
4. **Supply** — What to buy. Sync builds the list from active Galley meals, Manifest days inside the org **planning horizon**, and Cargo restock toggles — minus what Cargo already covers. Shop, mark purchased, then **dock** into Cargo (or replenish via receipt scan). See *Supply (shopping list)*.

## Closing the loop

Docking (or a Supply-linked receipt scan) adds purchases into Cargo. Cooking or consuming from Galley/Manifest deducts ingredients from Cargo. The next sync then sees a fuller pantry and a shorter list.

## Practical tip

Keep names consistent enough for semantic matching (milk variants, etc.), but you do not need exact string matches — Ration links close names when confidence is high.

If a screen label differs, follow the hub navigation: **Cargo**, **Galley**, **Manifest**, **Supply**.
