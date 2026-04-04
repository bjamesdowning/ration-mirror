# Galley (recipes and provisions)

## Recipes vs provisions

- **Recipes** are multi-ingredient meals with directions and (optionally) equipment and tags.
- **Provisions** are simple **single-ingredient** items (e.g. a piece of fruit) for quick planning and snacks.

Both live in **Galley** and can appear in the **Manifest** and **matching** widgets.

## Creating a meal manually

Use **Galley → New** (or equivalent in the app) to enter title, ingredients, units, servings, and directions. Ingredients may optionally **link** to a Cargo item for better cook and shopping accuracy.

## Editing

Open a meal, then **Edit** to change ingredients, tags, times, or narrative fields. Versioning is implicit—there is no separate draft mode described here beyond what the UI shows.

## AI and import (separate articles)

- **AI meal generation** from pantry: see *AI meal generation*.
- **Import from URL**: see *Import a recipe from a URL*.
- **Bulk JSON import** for power users: see *REST API (v1) overview* (Galley scope).

## Cooking from Galley

**Cook** deducts ingredients from Cargo using semantic matching so names do not have to match exactly. You can override **servings** when cooking to scale amounts.

## Matching

Galley works with **strict** and **partial** pantry matching—see *Matching cookable meals*.

If the app’s create/edit flow differs, follow **on-screen steps**.
