# Code Review: Provisions (Single-Item Support)

## Pre-Merge Checklist

### 1. Build & Type Safety
- [x] `bun run lint` passes without errors
- [x] `bun run typecheck` passes without type errors
- [x] `bun run test:unit` passes (all tests green)
- [x] No `console.log` in production code (only in logging modules)
- [x] No unused variables or imports

### 2. Cloudflare Workers Compatibility
- [x] No Node.js APIs used (`fs`, `net`, `child_process`)
- [x] All environment access uses `context.cloudflare.env` (DB, RATION_KV)
- [x] No `process.env` direct access

### 3. React Router Patterns
- [x] No `useEffect` for data fetching (loaders used; effects only for focus/success close)
- [x] Mutations use `useFetcher` with appropriate success/revalidation
- [x] API routes follow existing patterns (`requireActiveGroup`, `handleApiError`)

### 4. Security
- [x] API inputs validated with Zod (`ProvisionSchema`, `ProvisionUpdateSchema`)
- [x] Authentication: `requireActiveGroup` on both provision routes
- [x] Row-level security: all queries scoped by `organizationId` via plan/meal ownership
- [x] No secrets in code
- [x] Rate limiting: `checkRateLimit(..., "meal_mutation", user.id)` on POST and PATCH

### 5. Database
- [x] Schema change in `app/db/schema.ts` (`meal.type`)
- [x] Migration generated: `drizzle/0020_young_harry_osborn.sql`
- [x] Batch/atomic usage in `createProvision` / `updateProvision`
- [x] No vectorize/inventory sync impact (provisions are meals; supply pipeline unchanged)

### 6. Code Quality
- [x] Server functions pure where possible; RLS in server layer
- [x] Components single-responsibility (ProvisionCard, ProvisionEditModal, ProvisionQuickAdd)
- [x] TypeScript interfaces for props and API responses
- [x] Error handling via `handleApiError` in both API routes

### 7. Design & UX
- [x] Orbital Luxury tokens: ceramic, platinum, hyper-green, carbon, muted
- [x] Mobile-first: FAB, responsive grid, touch-friendly actions
- [x] Primary actions (Add Meal / Add Item) in toolbar and FAB

---

## Summary of Changes

- **Schema:** `meal.type` (`'recipe' | 'provision'`), index `meal_type_idx`.
- **Server:** `createProvision`, `updateProvision` in `meals.server.ts`; `getMeals` / match pipeline return `type`.
- **API:** POST `/api/provisions`, PATCH `/api/provisions/:id` (Zod, auth, rate limit).
- **Galley:** ProvisionCard, ProvisionEditModal, ProvisionQuickAdd; MealGrid branches on `meal.type`; “Add Item” in toolbar/FAB (filter UX unchanged).
- **Manifest:** MealPicker and getMealsForPicker provision-aware; getWeekEntries/MealSlotCard show “×N” for provisions.
- **Hub/Shared:** Manifest preview and shared manifest entries include `mealType`/`servingsOverride` and format provisions as “Name (×N)”.

---

## Concerns / Potential Issues

- **Migration:** Apply before deploy: `bun run db:migrate:dev` (local) and `bun run db:migrate:prod` (production).
- **PATCH wrong type:** If client sends PATCH for a recipe `meal.id`, server throws “Meal is not a provision” and `handleApiError` returns 500. Acceptable for now; could be 400 in a follow-up.

---

## Recommendations Applied

1. **ProvisionQuickAdd capacity check:** Use `fetcher.data.error === "capacity_exceeded"` instead of `fetcher.data.error?.startsWith("capacity_exceeded")` for consistency with MealQuickAdd and exact response shape.

---

## Approval

**Status: Approved for merge** after applying the recommendation above and running migrations in target environments.
