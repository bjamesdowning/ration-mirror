# Measurement System Implementation Plan

Implementation plan for all audit recommendations, with specific choices:
- **Finding 3**: Remove the `unitSystem` setting altogether
- **Finding 5**: Add all common cooking units

---

## Phase 1: Foundation (Units & Validation)

### 1.1 Add All Common Cooking Units to `app/lib/units.ts`

Expand `UNIT_FACTORS_TO_BASE` with full cooking unit support. Use US customary conversions where applicable (1 US cup = 236.588 ml).

**Volume units (base: ml):**

| Unit   | Factor to ml | Notes                          |
|--------|--------------|--------------------------------|
| ml     | 1            | (existing)                     |
| l      | 1000         | (existing)                     |
| tsp    | 4.92892      | US teaspoon                    |
| tbsp   | 14.7868      | US tablespoon (3 tsp)          |
| fl oz  | 29.5735      | US fluid ounce                 |
| cup    | 236.588      | US legal cup                   |
| pt     | 473.176      | US pint (2 cups)               |
| qt     | 946.353      | US quart (2 pints)             |
| gal    | 3785.41      | US gallon (4 quarts)           |

**Weight units (unchanged):** kg, g, lb, oz

**Count units (base: unit):**

| Unit   | Factor | Family      | Notes                    |
|--------|--------|-------------|--------------------------|
| unit   | 1      | count_unit  | (existing)               |
| piece  | 1      | count_unit  | Common recipe shorthand  |
| dozen  | 12     | count_unit  | 12 units                 |
| bunch  | 1      | count_unit  | e.g. "1 bunch parsley"   |
| clove  | 1      | count_unit  | e.g. "2 cloves garlic"   |
| slice  | 1      | count_unit  | e.g. "4 slices bread"    |
| head   | 1      | count_unit  | e.g. "1 head lettuce"    |
| stalk  | 1      | count_unit  | e.g. "2 stalks celery"   |
| sprig  | 1      | count_unit  | e.g. "3 sprigs thyme"    |
| can    | 1      | count_can   | (existing)               |
| pack   | 1      | count_pack  | (existing)               |

**Implementation steps:**
- Use a single `volume` family with base `ml` for all volume units (metric + US customary). This allows aggregation of "2 cups" + "500 ml" into one list item.
- Add new count units to `count_unit` family; keep `count_can` and `count_pack` separate.
- Update `chooseReadableUnit()` to handle new volume units (e.g., prefer cup for 200–500 ml range).
- Export `SUPPORTED_UNITS` as a const array for use in schemas and UI.

**Files:** `app/lib/units.ts`

---

### 1.2 Create Canonical Unit Constants and Shared Zod Schema

**New file: `app/lib/schemas/units.ts`**

- Export `SUPPORTED_UNITS` array (derived from `Object.keys(UNIT_FACTORS_TO_BASE)` or maintained in sync).
- Export `UnitSchema = z.enum(SUPPORTED_UNITS)`.
- Export `SUPPORTED_UNITS_AS_CONST` for type-safe iteration.

**Update all schemas to use the canonical enum:**
- `app/lib/inventory.server.ts` – replace inline enum with `UnitSchema`
- `app/lib/schemas/scan.ts` – import `SUPPORTED_UNITS` from `units.ts`, remove `SCAN_UNITS`
- `app/lib/schemas/meal.ts` – replace `z.string().min(1)` with `UnitSchema` (or `UnitSchema.or(z.string().transform(...))` for alias normalization)
- `app/lib/schemas/grocery.ts` – replace loose string with `UnitSchema`
- `app/lib/schemas/recipe-import.ts` – use `UnitSchema` or alias normalization

**Files:** `app/lib/schemas/units.ts`, `app/lib/inventory.server.ts`, `app/lib/schemas/scan.ts`, `app/lib/schemas/meal.ts`, `app/lib/schemas/grocery.ts`, `app/lib/schemas/recipe-import.ts`

---

### 1.3 Add Unit Alias Normalization Layer

**New file or section in `app/lib/units.ts`:**

```ts
const UNIT_ALIASES: Record<string, SupportedUnit> = {
  cups: "cup", tablespoon: "tbsp", tablespoons: "tbsp", tbsp: "tbsp",
  teaspoon: "tsp", teaspoons: "tsp", tsp: "tsp",
  "fl oz": "fl oz", "fluid ounce": "fl oz", "fluid ounces": "fl oz",
  liter: "l", liters: "l", litre: "l", litres: "l",
  milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml",
  gram: "g", grams: "g", kilogram: "kg", kilograms: "kg",
  ounce: "oz", ounces: "oz", pound: "lb", pounds: "lb", lbs: "lb",
  pint: "pt", pints: "pt", quart: "qt", quarts: "qt", gallon: "gal", gallons: "gal",
  piece: "piece", pieces: "piece", unit: "unit", units: "unit",
  dozen: "dozen", dozens: "dozen", can: "can", cans: "can",
  pack: "pack", packs: "pack", bunch: "bunch", bunches: "bunch",
  clove: "clove", cloves: "clove", slice: "slice", slices: "slice",
  head: "head", heads: "head", stalk: "stalk", stalks: "stalk",
  sprig: "sprig", sprigs: "sprig",
};
```

- Add `normalizeUnitAlias(raw: string): SupportedUnit` that checks aliases first, then falls back to `toSupportedUnit()`.
- Use in: scan AI output validation, recipe import, and any user-entered unit strings before persistence.

**Files:** `app/lib/units.ts`, `app/lib/schemas/scan.ts` (AI output), `app/lib/schemas/recipe-import.ts`

---

### 1.4 Delete Duplicate SCAN_UNITS and Fix Stale Comments (C3)

- **CsvImportButton.tsx:** Remove local `SCAN_UNITS` constant; import from `app/lib/schemas/units.ts` or `app/lib/units.ts`.
- **app/db/schema.ts:** Update comment at line ~193 from `// kg, g, l, ml, piece` to `// See app/lib/units.ts for supported units` or list the correct units.

**Files:** `app/components/cargo/CsvImportButton.tsx`, `app/db/schema.ts`

---

### 1.5 Remove unitSystem Setting (Finding 3)

**Settings UI:**
- Remove the entire "Measurement Standard" section (Unit System radio group) from `app/routes/dashboard/settings.tsx` (lines ~484–521).
- Remove the `update-units` intent branch from the action (lines ~181–202).
- Remove `isUpdatingUnits` derived state and related loading indicators.

**Types:**
- Remove `unitSystem` from `UserSettings` in `app/lib/types.ts`.
- Remove local `unitSystem` from `UserSettings` in `app/routes/dashboard/index.tsx` if duplicated there.

**Data:** No migration needed. Existing `unitSystem` values in `user.settings` will be ignored; optional cleanup can strip the key when settings are next updated.

**Files:** `app/routes/dashboard/settings.tsx`, `app/lib/types.ts`, `app/routes/dashboard/index.tsx`

---

## Phase 2: Data Integrity

### 2.1 Migrate quantity from INTEGER to REAL (A1)

**Schema changes in `app/db/schema.ts`:**
- `inventory.quantity`: `integer("quantity")` → `real("quantity")`
- `mealIngredient.quantity`: `integer("quantity")` → `real("quantity")`
- `groceryItem.quantity`: `integer("quantity")` → `real("quantity")`

**Migration:**
- Create Drizzle migration that uses `ALTER TABLE ...` to change column type. SQLite supports limited `ALTER`; if needed, use a migration that creates new columns, copies data (with cast), drops old columns, and renames.
- Alternative: create new table, copy data, drop old, rename (for SQLite compatibility).

**Zod schemas:** Ensure all quantity validations use `z.coerce.number()` or `z.number()` (not `z.number().int()`). Update:
- `app/lib/inventory.server.ts` – `InventoryItemSchema.quantity`
- `app/lib/schemas/meal.ts` – `MealIngredientSchema.quantity`
- `app/lib/schemas/grocery.ts` – `GroceryItemSchema.quantity` (remove `.int()` if present)
- `app/lib/schemas/scan.ts` – ensure `ScanResultItemSchema.quantity` allows floats

**Files:** `app/db/schema.ts`, `drizzle/XXXX_quantity_real_migration.sql`, `app/lib/inventory.server.ts`, `app/lib/schemas/meal.ts`, `app/lib/schemas/grocery.ts`, `app/lib/schemas/scan.ts`

---

### 2.2 Fix Meal Matching to Use Unit Conversion (A3)

**`app/lib/matching.server.ts`:**
- Import `toSupportedUnit`, `getUnitMultiplier`, `convertQuantity` from `~/lib/units`.
- Refactor `getAvailableQuantity()` (or add `getConvertedAvailableQuantity()`) to:
  - Accept the target unit from the ingredient.
  - For each matching inventory item, convert its quantity to the ingredient’s unit via `getUnitMultiplier` and `convertQuantity`.
  - Sum converted quantities.
  - Return the total in the ingredient’s unit.
- Ensure `strictMatch` and `deltaMatch` pass the ingredient unit when checking availability.

**Files:** `app/lib/matching.server.ts`

---

### 2.3 Fix Cook Deduction to Use Unit Conversion (A4)

**`app/lib/meals.server.ts` (cookMeal flow):**
- For each linked ingredient, resolve the inventory row and its unit.
- Use `convertQuantity(ing.quantity, ingUnit, inventoryUnit)` to get the deduction amount in inventory units.
- If conversion returns `null` (incompatible units), treat as insufficient and throw.
- Use the converted quantity in the SQL deduction: `quantity = quantity - <converted_qty>`.

**Files:** `app/lib/meals.server.ts`

---

### 2.4 Fix Dock Cargo to Use Unit-Aware Merging (A5)

**`app/lib/inventory.server.ts` (`dockGroceryItems`):**
- Replace exact `name|unit` key matching with unit-aware logic.
- For each grocery item, iterate over existing inventory and find matches where:
  - Name matches (normalized, e.g. `normalizeForMatch`).
  - Units are in the same family and convertible via `getUnitMultiplier`.
- If a match exists: convert grocery quantity to inventory unit, add to existing row, update map.
- If no match: create new inventory row as today.
- Reuse patterns from `grocery.server.ts` `getAvailableInventoryQuantity()` and `getExistingListQuantity()`.

**Files:** `app/lib/inventory.server.ts`

---

## Phase 3: UX Improvements

### 3.1 Replace Free-Text Unit Input with Dropdown (B2)

**`app/components/galley/IngredientPicker.tsx`:**
- Replace the unit `<input>` with a `<select>` (or combobox if you want search).
- Populate options from `SUPPORTED_UNITS` (or a grouped list: Weight, Volume, Count).
- Use `value={ing.unit}` and `onChange` to update state.
- Ensure the default for new ingredients is `"unit"` (or a sensible default like `"g"` for weight-ish items if you add heuristics later).

**Files:** `app/components/galley/IngredientPicker.tsx`

---

### 3.2 Always Show Quantity and Unit in GroceryItem (B3)

**`app/components/supply/GroceryItem.tsx`:**
- Change `{item.quantity > 1 && (...)}` to always render quantity and unit.
- Use `{item.quantity} {item.unit}` (or a formatted version via `formatQuantity` when added) for all items.
- Consider hiding only when quantity is 0 and unit is "unit" if that edge case exists.

**Files:** `app/components/supply/GroceryItem.tsx`

---

### 3.3 formatQuantity Display Utility (C4)

**New file: `app/lib/format-quantity.ts`**
- Implement `formatQuantity(qty: number, unit: string): string`.
- Round floats to readable forms: e.g. 0.25 → "¼", 0.5 → "½", 0.333 → "⅓", 1.5 → "1½".
- For non-fractional numbers, use appropriate decimal places (e.g. 2 for most, 0 for counts).
- Use in: `GroceryItem`, `MealDetail` ingredient display, and any other quantity display.

**Files:** `app/lib/format-quantity.ts`, `app/components/supply/GroceryItem.tsx`, `app/components/galley/MealDetail.tsx`

---

## Phase 4: Cross-System Conversion (Optional, C2)

### 4.1 Add Metric ↔ Imperial Conversion

**`app/lib/units.ts`:**
- Introduce super-families: `weight` (g + oz) and `volume` (ml + fl oz / cup, etc.).
- Define cross-system factors: 1 oz = 28.3495 g, 1 fl oz = 29.5735 ml (US).
- Add `areConvertible(a, b)` that returns true if units can be converted (same super-family).
- Extend `getUnitMultiplier` / `convertQuantity` to support cross-family conversion when units are in the same super-family.
- Update `chooseReadableUnit` if you later re-add a display preference (e.g. always metric vs always imperial for output).

**Note:** Deferred if timeline is tight; Phase 1–3 deliver most value.

---

## Implementation Order

| Step | Task                                      | Phase  | Deps   |
|------|-------------------------------------------|--------|--------|
| 1    | Add all cooking units to units.ts         | 1.1    | -      |
| 2    | Create schemas/units.ts + shared Zod      | 1.2    | 1      |
| 3    | Add unit alias normalization              | 1.3    | 1      |
| 4    | Delete duplicate SCAN_UNITS, fix comments | 1.4    | 2      |
| 5    | Remove unitSystem setting                 | 1.5    | -      |
| 6    | Migrate quantity to REAL                  | 2.1    | -      |
| 7    | Fix meal matching with unit conversion    | 2.2    | 1, 6   |
| 8    | Fix cook deduction with unit conversion   | 2.3    | 1, 6   |
| 9    | Fix dock cargo unit-aware merge           | 2.4    | 1, 6   |
| 10   | Unit dropdown in IngredientPicker         | 3.1    | 2      |
| 11   | Always show qty+unit in GroceryItem       | 3.2    | -      |
| 12   | formatQuantity utility                    | 3.3    | -      |
| 13   | Cross-system conversion (optional)        | 4.1    | 1      |

---

## Testing Checklist

- [ ] Add inventory with fractional quantities (0.5 kg, 1.5 cups); verify persistence and display
- [ ] Add meal ingredients with new units (tbsp, cup, dozen); verify save and list generation
- [ ] Generate grocery list from meals; verify aggregation of same ingredient in different units
- [ ] Cook a meal with linked inventory; verify correct deduction when units differ (g vs kg)
- [ ] Dock cargo: add "flour|kg" when inventory has "flour|g"; verify merge
- [ ] Scan/receipt: verify AI output with aliases ("cups", "grams") normalizes correctly
- [ ] Recipe import: verify imported units map via aliases
- [ ] Settings: verify "Measurement Standard" section is gone and no regressions
- [ ] Run `bun run lint`, `bun run typecheck`, `bun run test:unit`
