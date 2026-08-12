# Tenancy classes: Kitchen / Person / Person-in-context

Canonical guide for how Ration scopes data across organizations (kitchens) and signed-in users. Use this when adding tables, APIs, or UI that touch multi-group users.

Related: [feature-flags.md](feature-flags.md) (`nutrition-cross-org-diary`), [nutrition-dpia-notes.md](nutrition-dpia-notes.md), README §7.2.

## Roommate story

Alice and Bob share **Shared Home** (one kitchen: Cargo, Galley, Manifest, Supply, credits). Each also has a **personal** organization.

Bob logs breakfast at Shared Home, then switches the active group to his personal kitchen for lunch planning. With **`nutrition-cross-org-diary`** on, his **day total** still includes the Shared Home breakfast — the diary is **user-global**, not reset by the group switcher. Kitchen inventory and meal plans stay isolated; only personal intake summary/history may span kitchens. Alice never sees Bob’s kcal or plate-up servings.

## Three classes

| Class | Ownership | Org role | Typical tables |
|-------|-----------|----------|----------------|
| **Kitchen** | Organization | Required; cascade delete with org | `cargo`, `meal`, `meal_plan`, `supply_*`, `kitchen_event`, credits |
| **Person** | User | None (user-global) | `nutrition_goal`, `nutrition_consent` |
| **Person-in-context** | User | Provenance only; nullable after org delete | `nutrition_intake` |

### ER sketch

- **Kitchen** row → `organization_id NOT NULL` → `ON DELETE CASCADE` (workspace dies with the kitchen).
- **Person** row → `user_id NOT NULL` → `ON DELETE CASCADE` with account; no org FK.
- **Person-in-context** row → `user_id` owner + optional `organization_id` → `ON DELETE SET NULL`, plus **name snapshots** (`organization_name_snapshot`, `meal_name_snapshot`) so diary chips survive after the kitchen or meal join is gone.

Writers of Person-in-context rows **always** set a non-null org and snapshots at insert/upsert time. Null org appears only after a shared kitchen hard-delete.

## Domain mapping

| Domain | Class | Notes |
|--------|-------|-------|
| Cargo / Galley / Manifest plan / Supply / credits | Kitchen | Active-group scoped; never merge across orgs |
| Nutrition goals & consent ledger | Person | One active goal/consent story per user |
| Manifest Eat / Quick Eat intake, day totals, calendar history | Person-in-context | Private to `userId`; kitchen is provenance + chip label |
| Flight Recorder / shared kitchen events | Kitchen | Logistics only — no personal kcal in payloads |
| API keys / agent registration | Kitchen | Key bound to one org |

## Read vs write rules

| Class | Write | Read |
|-------|-------|------|
| **Kitchen** | `requireActiveGroup()` / verified membership; scope every mutation by `organizationId` from session | Same org only |
| **Person** | Anchor on session `userId` only | Same user only |
| **Person-in-context** | Session `userId` + **current kitchen** membership; persist non-null `organizationId` + snapshots | Owner only. When **`nutrition-cross-org-diary`** is on (and parent manifest/goals capability allows), **summary/history aggregate across all kitchens** for that user. Flag off → active-org filter (legacy). |

Never take `organizationId` or `userId` from client input as the tenancy anchor. Household members must not read another member’s intake or goals.

## Durability

- Shared kitchen **delete** or leave/remove membership: Kitchen rows for that org go away (or stay with the group on leave). Person-in-context intake **remains** for the user; `organization_id` becomes `NULL` via `SET NULL`; chips use snapshots.
- **Account purge**: cascade-delete Person and Person-in-context with the user (plus retention purge ~396 days for intake).
- Meal delete: intake may `SET NULL` on `meal_id` and keep `meal_name_snapshot`.

## Non-goals

- Merging Cargo, Galley, Manifest plans, Supply, or credits across organizations.
- Showing personal intake or goals to other kitchen members.
- Implying medical/clinical advice or HealthKit sync.
- Using Flagship alone without server-side capability checks (`resolveNutritionCapabilities` / `isFeatureEnabled`).

## Feature checklist

When adding a table, API, or agent tool:

1. **Declare the tenancy class** (Kitchen / Person / Person-in-context) in schema comments and PR notes.
2. Pick FK + delete behavior to match the class (`CASCADE` vs `SET NULL` + snapshots).
3. Gate Person-in-context **cross-kitchen reads** behind `nutrition-cross-org-diary` (child of manifest or engine+goals — see `feature-policy.server.ts`).
4. Keep shared event/audit payloads free of personal nutrient values.
5. Update help (`docs/fin/`) and DPIA notes when processing or retention changes.
6. Add unit tests for org-scoped vs user-global read paths when both exist.

## Flag

| Flag key | Client key | Role |
|----------|------------|------|
| `nutrition-cross-org-diary` | `nutritionCrossOrgDiary` | User-global personal intake summary/history across kitchens |

Default **off**. Create the Flagship boolean before enabling. Rollout order: after `nutrition-manifest` / `nutrition-goals` — see [nutrition-rollout.md](nutrition-rollout.md).
