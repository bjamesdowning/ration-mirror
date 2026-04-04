# Matching cookable meals

## What matching does

Ration compares **Galley** recipes to **Cargo** and estimates which meals you can make **now** vs which need more shopping.

## Strict match

**Strict** mode only includes meals where **every required ingredient** is covered by pantry quantities (optional ingredients can be skipped per recipe rules). Hub widgets like **Meals ready** use this for a confident “you can cook this today” signal.

## Partial (delta) match

**Partial** mode ranks meals by **percentage** of ingredients you already have and can show **what is missing**. Useful for planning before a shop.

## How names are resolved

Matching does **not** require identical spelling. Semantic similarity plus unit conversion helps map recipe lines to pantry items—within safe thresholds so cooking deductions stay trustworthy.

## Where you see it

- **Hub** widgets (meals ready / partial / snacks).
- **Galley** match views when exposed in the UI.

## MCP

Agents can call **`match_meals`** with `strict` or `delta` modes—see *MCP tools reference*.

If percentages or labels differ in-product, **trust the UI**.
