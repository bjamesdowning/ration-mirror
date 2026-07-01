# iOS Polish Sprint — Review Fix Plan (Concerns 1–5)

**Version:** 1.4.15  
**Date:** 2026-07-01

## Concern 1 — Untracked sprint files (merge blocker)

**Fix:** Stage all sprint-related new/modified files with `git add`. XcodeGen already includes `Ration/` and `RationTests/` via directory sources — no `pbxproj` edits required.

**Excluded from sprint staging:** None — `AIConsentCoordinatorTests.swift` is valid H-8 coverage and is included.

## Concern 2 — Manifest undo when `deductions` empty

**Fix:** Issue undo token whenever `consumed > 0`, storing `entryIds` + `planId` even if `deductions` is empty. `applyUndoRecord` runs entry revert in the same batch as cargo restores (entry-only batch when deductions empty).

**File:** `app/routes/api/mobile/v1.manifest.consume.ts`

## Concern 3 — Token burned before auth check

**Fix:** `consumeUndoToken` parses and validates `userId`/`organizationId` before `kv.delete`. Wrong-org attempts return `null` and leave the token valid for the owner.

**Tests:** `app/lib/__tests__/undo-token.test.ts`

## Concern 4 — Non-atomic undo reversal

**Fix:** Single `applyUndoRecord()` builds one `db.batch()` for all cargo `+quantity` updates and manifest `consumedAt = null` updates (after plan ownership pre-check).

**File:** `app/lib/cook-reversal.server.ts`, `app/routes/api/mobile/v1.undo.ts`

## Concern 5 — Meal ingredient cargo linking

**Fix:** `EditableMealIngredient.cargoId`, link/unlink helpers, `MealIngredientEditorView` cargo menu (name-filtered + browse), `EditMealView` loads `cargo(limit: 100)` alongside tag suggestions.

**Files:** `MealIngredientEditorView.swift`, `AddMealSheet.swift` (`EditMealView`)
