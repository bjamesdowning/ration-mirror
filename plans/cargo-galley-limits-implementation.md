# Cargo & Galley Limits — Implementation Plan

Implementation plan for fixing silent truncation and display limits, based on the analysis in the Cargo/Meals limits investigation.

---

## 1. Galley Import — Surface 100-Meal Truncation (No Upgrade Language)

**Problem:** Server truncates at 100 meals with no user feedback. Message must not advise upgrade.

**Changes:**

### 1.1 API Response — Add `truncated` field

**File:** [`app/routes/api/galley.import.ts`](app/routes/api/galley.import.ts)

- Call `applyGalleyImport` as today.
- Before returning, compare `manifest.meals.length` to `importResult.imported + importResult.updated` (or the raw count processed). Better: have `applyGalleyImport` return `truncated?: number` when `manifest.meals.length > MAX_MEALS_IMPORT`.
- Extend `ApplyGalleyImportResult` in [`app/lib/galley.server.ts`](app/lib/galley.server.ts):
  - Add `truncated?: number` (number of meals dropped).
- API response includes: `{ success, imported, updated, errors, truncated? }`.
- When `truncated > 0`, the API returns e.g. `truncated: 50`.

### 1.2 Server — Return truncation count

**File:** [`app/lib/galley.server.ts`](app/lib/galley.server.ts)

- Add `truncated?: number` to `ApplyGalleyImportResult`.
- After `const meals = manifest.meals.slice(0, MAX_MEALS_IMPORT)`:
  - If `manifest.meals.length > MAX_MEALS_IMPORT`, set `result.truncated = manifest.meals.length - MAX_MEALS_IMPORT`.

### 1.3 UI — Show truncation message (no upgrade)

**File:** [`app/components/galley/GalleyImportPreview.tsx`](app/components/galley/GalleyImportPreview.tsx)

- **Pre-import warning (when manifest has >100 meals):** Show a banner above the meal list:
  > Limit is 100 meals per import. Break your file into multiple imports. Only the first 100 meals will be added.
- **Post-import feedback:** When `fetcher.data` includes `truncated > 0`, show:
  > Import complete. Only the first 100 meals were added. {truncated} meal(s) were not imported. Break your file into multiple imports to add the rest.

Use design tokens (e.g. `text-muted`, `bg-platinum/20`) and avoid any upgrade/CTA language.

---

## 2. Galley Import — Client-Side Selection Cap

**Problem:** User can select 150 meals; server silently imports only 100.

**File:** [`app/components/galley/GalleyImportPreview.tsx`](app/components/galley/GalleyImportPreview.tsx)

- Add constant `MAX_MEALS_PER_IMPORT = 100` (or import from a shared constant used by `galley.server`).
- When `manifest.meals.length > MAX_MEALS_PER_IMPORT`:
  - On "Select All", only select the first 100 meals (or show the pre-import warning and restrict selection).
  - Simpler approach: show the warning, allow selection of all, but on submit trim the submitted array to 100 and show a confirm: "Only the first 100 selected meals will be imported. Proceed?"
- Recommended: Show the pre-import warning and cap selection to 100. Disable "Import" when >100 selected and show: "Deselect meals to bring total to 100 or fewer."
- Alternatively: allow import but always send only first 100; the server already truncates. The key is the pre-import warning so users know before they submit.

**Chosen approach:** Pre-import warning when `manifest.meals.length > 100`. Do not cap selection; on submit, send up to 100. API response includes `truncated`. Post-import modal shows the truncation message. User can run another import for the rest.

---

## 3. Cargo CSV Import — Truncation Warning (500 rows)

**Current behavior:** `csv-parser` adds `"Row limit exceeded. Only the first 500 items were kept."` to warnings; CsvImportButton displays warnings. So CSV import already informs the user.

**Improvement:** Make the 500-row limit explicit and consistent:

**File:** [`app/components/cargo/CsvImportButton.tsx`](app/components/cargo/CsvImportButton.tsx)

- When `result.items.length >= 500` (or when warnings include the row-limit message), show a clear banner in the ScanResultsModal context:
  > Limit is 500 items per import. Only the first 500 will be added. Break your file into multiple imports to add more.

We need to pass this to ScanResultsModal. Options:
- Add optional `truncationWarning?: string` prop to ScanResultsModal.
- Or: CsvImportButton already shows warnings below the button. Ensure the 500-row warning is visible (e.g. in ScanResultsModal header when opening with a truncated result).

**Action:** Add `truncationWarning` prop to ScanResultsModal when `result.items.length === 500 && result.metadata?.source === 'csv'` and csv-parser emitted the row-limit warning. Display it prominently in the modal header.

---

## 4. Pagination UI — Cargo & Galley

**Problem:** Loaders fetch 200 cargo / 100 meals per page, but there is no pagination UI. Users with more items never see them.

**Changes:**

### 4.1 Shared Pagination Component

**New file:** `app/components/shell/PaginationBar.tsx`

- Props: `currentPage`, `totalItems`, `pageSize`, `onPageChange`, `itemLabel` (e.g. "items", "meals").
- Renders: "Page X of Y" (or "1–200 of 523 items") with Previous / Next.
- Uses `?page=N` via `useSearchParams` and `navigate` or `onPageChange` callback to update URL.
- Mobile-friendly, Orbital design tokens.

### 4.2 Cargo Page

**File:** [`app/routes/hub/cargo.tsx`](app/routes/hub/cargo.tsx)

- Loader: Fetch **total count** in addition to the page of items. Use a separate `COUNT(*)` query or have `getCargo` accept a flag to return `{ items, total }`. Simpler: add `getCargoCount(db, organizationId, domain?)` and call it in parallel with `getCargo`.
- Pass `totalCargo`, `page`, `pageSize` to the component.
- When `totalCargo > pageSize`, render `PaginationBar` below the grid.
- URL: `?page=0`, `?page=1`, etc. (already parsed in loader).

### 4.3 Galley Page

**File:** [`app/routes/hub/galley.tsx`](app/routes/hub/galley.tsx)

- Same pattern: add `getMealsCount(db, organizationId, tag?, domain?)` (or extend `getMeals` to return count when requested).
- Render `PaginationBar` when `totalMeals > pageSize`.

### 4.4 Data Layer

**Files:** [`app/lib/cargo.server.ts`](app/lib/cargo.server.ts), [`app/lib/meals.server.ts`](app/lib/meals.server.ts)

- Add `getCargoCount(db, organizationId, domain?)` returning a number.
- Add `getMealsCount(db, organizationId, tag?, domain?)` returning a number.
- Both use `COUNT(*)` with the same filters as the list query (org, optional domain/tag).

---

## 5. Pagination — Fixed Page Sizes (No Tier Differentiation)

**Page sizes remain 200 (Cargo) and 100 (Galley) for all tiers.** No larger page sizes for Crew.

- **Cargo:** `CARGO_PAGE_SIZE = 200`. Example: 500 items → 3 pages (200, 200, 100).
- **Galley:** `GALLEY_PAGE_SIZE = 100`. Example: 250 meals → 3 pages (100, 100, 50).

This keeps the existing visibility limits, adds pagination UI so users can navigate between pages, and avoids any tier-specific logic.

---

## 6. Implementation Order

| Step | Task | Files |
|------|------|-------|
| 1 | Galley import: server returns `truncated`, API passes it | galley.server.ts, galley.import.ts |
| 2 | Galley import: pre-import warning when >100 meals | GalleyImportPreview.tsx |
| 3 | Galley import: post-import message when truncated | GalleyImportPreview.tsx |
| 4 | Cargo CSV: ensure 500 truncation warning visible | CsvImportButton, ScanResultsModal |
| 5 | Add `getCargoCount`, `getMealsCount` | cargo.server.ts, meals.server.ts |
| 6 | Create `PaginationBar` component | components/shell/PaginationBar.tsx |
| 7 | Cargo page: total count + pagination | cargo.tsx |
| 8 | Galley page: total count + pagination | galley.tsx |

---

## 7. Acceptance Criteria

- [ ] Manifest with 150 meals shows pre-import warning: "Limit is 100 meals per import. Break your file into multiple imports. Only the first 100 meals will be added." No upgrade language.
- [ ] After import of 150 meals, user sees: "Only the first 100 meals were added. 50 meal(s) were not imported. Break your file into multiple imports to add the rest."
- [ ] Cargo CSV with 600 rows shows clear truncation message (500 limit).
- [ ] Cargo page with 250+ items shows pagination (Previous/Next); user can view all items (e.g. 500 items → 3 pages of 200, 200, 100).
- [ ] Galley page with 120+ meals shows pagination; user can view all meals (e.g. 250 meals → 3 pages of 100, 100, 50).
- [ ] `bun run lint`, `bun run typecheck`, `bun run test:unit` pass.
- [ ] Version bumped per project rules.
