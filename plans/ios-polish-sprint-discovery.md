# iOS Polish Sprint — Phase 0 Discovery

Consolidated findings from parallel codebase research. File:line references anchor implementation work.

## WS-1 — Meal Availability (CONFIRMED)

| Aspect | Web | iOS |
|--------|-----|-----|
| Call 1 | `GET /api/meals/match?mode=strict&limit=1&servings=N` | `GET /api/mobile/v1/meals/match?mode=strict&limit=20&servings=N` |
| Call 2 | `GET /api/meals/match?mode=delta&minMatch=0&limit=100&servings=N` | **Missing** |
| preLimit | None | `Math.max(12, limit)` → 20 (`v1.meals.match.ts:44-52`) |

**Root cause:** `GalleyView.swift:343-356` — strict only; no delta fallback. `MealAvailabilityEngine.swift:49` — nil match → all `.partial`.

**Reproduction:** Partial meal in Hub → iOS detail shows all amber ingredients; web shows correct states.

## WS-9 — Manifest Rocker (CONFIRMED)

Chevrons toggle current week ↔ next week only.

**Suspects:** `ManifestView.swift:147` (restoreSnapshot clobbers rangeStart), `:241-244` (task resets anchor), week normalization in `WeekNavigator.swift:117-123`.

## WS-15 — Supply Dedup

`supply.server.ts:224-255` — key is `name+domain+baseUnit`; no cross-unit merge. Both web and iOS call `createSupplyListFromSelectedMeals`. Fix server-only.

## API Gap Table

| Capability | Web | Mobile | Action |
|------------|-----|--------|--------|
| Match delta fallback | Client | Client | iOS fix |
| Toggle-active + servings | Y | N | Extend mobile route |
| Meal selection on GET | Y | N | Extend meal GET |
| Credit transfer | Y | Missing | New mobile route |
| Meal PATCH partial | N/A | Destructive full schema | Partial schema |
| Manifest settings PATCH | Y | Excluded | Extend schema |
| Undo reversal | N | N | New API (Phase 2B) |
| Supply sync on pull-refresh | Conditional | Partial | iOS trigger fix |

## Server-Side Parity Mandate

iOS must never implement dedup, matching, or aggregation. All fixes in `app/lib/*.server.ts`; both clients inherit.
