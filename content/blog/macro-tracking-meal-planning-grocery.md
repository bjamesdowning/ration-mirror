---
title: "Macro tracking that starts from dinner, not a second diary"
description: "How calorie and macro goals fit a pantry, recipe library, weekly plan, and shopping list — without a separate food log."
date: 2026-08-14
dateModified: 2026-08-14
authorName: "Ration"
image: "/static/ration-logo.png"
tags:
  - macro tracking
  - meal planning
  - grocery list
  - pantry
  - nutrition
  - calorie goals
---

People track macros in one app and plan dinner in another. The diary never sees the recipe they actually cooked. The shopping list never sees the diary. By Wednesday the numbers are a guess, and the fridge is still full of the wrong things.

That split is the product, not a personal failing. Macro apps are built to log foods. Kitchen apps are built to decide meals and buy groceries. The join — the meal you cooked, the stock you used, the list you shopped — is left for you to reconcile by hand.

## The missing join

Macros only stay honest if they come from the same meal object as the ingredients, the pantry deduction, and the grocery delta.

If the log is a second database of “chicken breast, 150 g,” it cannot know that tonight’s Galley recipe was a tray bake with yogurt marinade, or that cooking it emptied the last of the chicken. If the shopping list is a paste of recipe ingredients, it cannot know you already have the yogurt.

A connected kitchen treats dinner as one fact that fans out: what you have, what you cook, what you still need to buy, and — if you want it — what *you* ate.

## Where the numbers come from

In [Ration](https://ration.mayutic.com), energy and macros attach to Cargo items and Galley meals as composition snapshots. Lookup prefers a self-hosted USDA-shaped reference match. If that miss happens on a manual add or CSV import, the panel stays blank until you fill it. On AI ingest (receipt scan, [URL / social / photo import](/help/13-add-meals-url-import), AI meal generation), a labelled **Estimated** fill can appear when that flag is on. Estimates are not verified until you edit them.

You can override values on scan review, Cargo, or Galley. Overrides are marked verified and can feed linked meal totals. Past diary rows do not rewrite when you fix a pantry snapshot later.

Details: [Nutrition overview](/help/24-nutrition-overview) and [Editing nutrition](/help/26-editing-nutrition).

This is a planning aid, not medical advice, and not a live USDA.gov API.

## Plan the week, then eat

**Manifest** holds the household plan: breakfast, lunch, dinner, snack. That plan is shared kitchen work.

**Cook** deducts Cargo once and marks the entry prepared. Housemates see that the meal happened. Cook does not write anyone’s calories.

**Log my serving** is private plate-up for how much *you* ate. Fraction chips (¼ through 2), a typed amount (0.01–100 servings), and optional **g / oz** when the meal has recipe-ingredient mass. Mass is ingredient grams, not cooked plated weight. Macros scale as per-serving values times servings.

Goals are personal: energy and/or protein, carbs, fat, fiber. Empty fields stay hidden. **Macro Tracking** is an explicit Feature enablement toggle — not implied by Cook, Prepared status, or saving a goal. Daily Fuel and Fuel Trends on the Hub show your progress. Intake older than about 13 months is purged.

See [Macro tracking, goals, and intake](/help/25-nutrition-goals-and-tracking).

## Grocery still closes the logistics loop

**Supply** is plan minus stock: active Galley meals, included Manifest days inside the planning horizon, and Cargo restock toggles, minus what Cargo already covers.

Macros do not rewrite that list. They tell you whether the week you already planned is landing on target *after* you cook. Remaining protein is not a shopping generator. AI Plan Week drafts from your Galley and preferences; it does not optimize for macro targets.

That is the same [meal planning loop](/blog/meal-planning-loop) as before. Daily Fuel sits on top of it.

## Import belongs here

A website, a TikTok / Instagram / YouTube post, or a cookbook photo can become a Galley meal. Review the extract (full recipe, partial skeleton, or saved-link holder), then keep it. When nutrition is on, ingredients can pick up USDA or estimated snapshots so you can plan and log the same meal.

Ask Ration will not scrape a URL in chat. Use Galley Import (Share → Ration on iOS).

## Privacy

Housemates see Prepared meals and pantry stock. They never see your kcal. If you cook in more than one kitchen and cross-kitchen diary is on, *your* day total can include both — still only yours.

## Ask Ration

Copilot can read remaining-versus-goal for the UTC calendar day, match cookable meals to that leftover budget, and log a Quick Eat snack. It never prescribes calorie targets. Not medical advice.

## FAQ

**Is this medical advice?**

No. Goals and day totals are optional planning aids, not clinical guidance. Review AI estimates before you rely on them.

**Are macros shared with the household?**

No. Cook is shared stock. Logging a serving is private to the signed-in person. Flight Recorder stays logistics-only.

**Does shopping use my remaining protein?**

No. Supply is computed from the meal plan and pantry, not from leftover macros.

**Where do calories on a recipe come from?**

USDA-shaped match first, blank on miss for manual paths, labelled estimate only on some AI ingest paths. You can override. See [Nutrition overview](/help/24-nutrition-overview).

**Can I log half a serving or grams?**

Yes. Plate-up accepts serving fractions and typed servings. Grams or ounces are available when the meal has recipe-ingredient mass. If mass is unknown, use a serving fraction rather than inventing grams.

---

If you want pantry, recipes, the week, the grocery delta, and private macros from the meals you cooked — that is one loop, not three apps. On iPhone the listing is **Ration: Meal & Macro Planner**.

Start free at [ration.mayutic.com](https://ration.mayutic.com). No credit card required.

---

*Written by Grok. Curated and reviewed by the Ration team.*
