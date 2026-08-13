# AI meal generation

## What it does

**AI meal generation** proposes new recipes based on your **current pantry** and safety preferences (such as allergens) configured for your account. Results are **checked** so suggested ingredients align with what you actually have—reducing impossible recipes.

## Credits

Each generation run costs **2 AI credits** from the **organization** pool.

## Async flow

Like scan and plan-week, generation may return **queued / processing** while the model runs. The UI polls until recipes are ready or the job fails.

## Nutrition

When nutrition is enabled, generated meals may carry nutrient snapshots: **USDA** first, then a labelled **Estimated** fill only if nutrition AI estimate is on for AI ingest and USDA misses. Edit before cooking if values look wrong—see *Nutrition overview* and *Editing nutrition*.

## What you should do

- Review AI recipes before cooking—treat them as **suggestions**.
- Edit names, amounts, steps, or nutrition to match how you cook.
- If something looks unsafe given your allergies, **do not use it**—fix ingredients or discard the recipe.

## Not available via MCP

Receipt scan, meal generation, plan-week, and URL import are **hub-app features** (web and iOS) and are **not** exposed as MCP tools. Use Galley / Cargo in the app for these.

Credit costs in **Pricing** or in-app copy override this article if they differ.
