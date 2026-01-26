# Phase 4 Implementation Summary: Grocery List and Export Features

## Overview

Phase 4 implements full grocery list management with sharing and export capabilities. This phase adds:
- Multi-list grocery management system
- Item-level purchase tracking
- Shareable list URLs with expiration
- Plain text and Markdown export options
- Integration with meal planning for ingredient transfer

## Implementation Date
2026-01-26

---

## Database Changes

### New Tables

#### grocery_list
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | UUID primary key |
| `user_id` | TEXT (FK) | Reference to user table |
| `name` | TEXT | List name (default: "Shopping List") |
| `share_token` | TEXT (UNIQUE) | URL-safe share token |
| `share_expires_at` | INTEGER | Unix timestamp for token expiry |
| `created_at` | INTEGER | Creation timestamp |
| `updated_at` | INTEGER | Last update timestamp |

#### grocery_item
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | UUID primary key |
| `list_id` | TEXT (FK) | Reference to grocery_list |
| `name` | TEXT | Item name |
| `quantity` | INTEGER | Item quantity |
| `unit` | TEXT | Unit of measurement |
| `category` | TEXT | Item category for grouping |
| `is_purchased` | INTEGER | Boolean for purchase status |
| `source_meal_id` | TEXT (FK) | Optional reference to source meal |
| `created_at` | INTEGER | Creation timestamp |

### Migration
Migration file: [`drizzle/0004_long_imperial_guard.sql`](../drizzle/0004_long_imperial_guard.sql)

---

## Backend Implementation

### Server Module: [`app/lib/grocery.server.ts`](../app/lib/grocery.server.ts)

**Core Functions:**
- `getGroceryLists(db, userId)` - Get all lists with items for a user
- `getGroceryList(db, userId, listId)` - Get single list with items
- `createGroceryList(db, userId, data)` - Create new list
- `updateGroceryList(db, userId, listId, data)` - Update list metadata
- `deleteGroceryList(db, userId, listId)` - Delete list (cascades items)

**Item Operations:**
- `addGroceryItem(db, userId, listId, data)` - Add item to list
- `updateGroceryItem(db, userId, listId, itemId, data)` - Update item
- `deleteGroceryItem(db, userId, listId, itemId)` - Remove item

**Share System:**
- `generateShareToken(db, userId, listId)` - Generate 7-day share URL
- `revokeShareToken(db, userId, listId)` - Revoke existing share
- `getGroceryListByShareToken(db, token)` - Public list access

**Meal Integration:**
- `addItemsFromMeal(db, userId, listId, mealId)` - Add missing meal ingredients

### Export Module: [`app/lib/export.server.ts`](../app/lib/export.server.ts)

- `exportGroceryListAsText(list)` - Plain text format with checkboxes
- `exportGroceryListAsMarkdown(list)` - Markdown format for notes apps

### Validation Schemas: [`app/lib/schemas/grocery.ts`](../app/lib/schemas/grocery.ts)

Zod schemas for input validation:
- `GroceryListSchema` - List creation/update
- `GroceryItemSchema` - Item creation
- `GroceryItemUpdateSchema` - Item updates (partial)
- `AddFromMealSchema` - Meal-to-list transfer

---

## API Routes

### Collection Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/grocery-lists` | List all user's grocery lists |
| POST | `/api/grocery-lists` | Create new list |

### Single List Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/grocery-lists/:id` | Get list with items |
| PUT | `/api/grocery-lists/:id` | Update list metadata |
| DELETE | `/api/grocery-lists/:id` | Delete list |

### Item Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/grocery-lists/:id/items` | Add item to list |
| PUT | `/api/grocery-lists/:id/items/:itemId` | Update item |
| DELETE | `/api/grocery-lists/:id/items/:itemId` | Remove item |

### Feature Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/grocery-lists/:id/from-meal` | Add missing meal ingredients |
| POST | `/api/grocery-lists/:id/share` | Generate share URL |
| DELETE | `/api/grocery-lists/:id/share` | Revoke share URL |
| GET | `/api/grocery-lists/:id/export` | Export as text/markdown |

### Public Route

| Method | Path | Description |
|--------|------|-------------|
| GET | `/shared/:token` | View shared list (no auth required) |

---

## Frontend Components

### Component Directory: `app/components/supply/`

#### [`GroceryList.tsx`](../app/components/supply/GroceryList.tsx)
Main container component featuring:
- Progress bar showing purchased/total items
- Category-grouped item display
- Share and export action buttons
- Add item form integration

#### [`GroceryItem.tsx`](../app/components/supply/GroceryItem.tsx)
Individual item row with:
- Checkbox toggle for purchase status
- Optimistic UI updates via `useFetcher`
- Hover-reveal delete button
- Category badge display

#### [`AddItemForm.tsx`](../app/components/supply/AddItemForm.tsx)
Item creation form with:
- Quick-add inline input
- Expandable options for quantity/unit/category
- Submits via `useFetcher` for non-blocking UX

#### [`ShareModal.tsx`](../app/components/supply/ShareModal.tsx)
Sharing dialog featuring:
- One-click share link generation
- Copy-to-clipboard functionality
- 7-day expiry notice
- Link revocation option

#### [`ExportMenu.tsx`](../app/components/supply/ExportMenu.tsx)
Dropdown export menu with:
- Plain text export option
- Markdown export option
- Direct download via browser navigation

### Dashboard Route: [`app/routes/dashboard/grocery.tsx`](../app/routes/dashboard/grocery.tsx)

Full-page grocery management featuring:
- Multi-list tab selector
- Inline list creation
- List deletion with confirmation
- Auto-refresh on item operations

### Shared Route: [`app/routes/shared.$token.tsx`](../app/routes/shared.$token.tsx)

Public read-only view for shared lists:
- No authentication required
- Category-grouped display
- Progress indicator
- Branded footer

---

## Route Configuration

Added to [`app/routes.ts`](../app/routes.ts):

```typescript
// Dashboard - Grocery Lists
route("grocery", "routes/dashboard/grocery.tsx"),

// Public - Shared Lists
route("shared/:token", "routes/shared.$token.tsx"),

// API - Grocery Lists
route("api/grocery-lists", "routes/api/grocery-lists.ts"),
route("api/grocery-lists/:id", "routes/api/grocery-lists.$id.ts"),
route("api/grocery-lists/:id/items", "routes/api/grocery-lists.$id.items.ts"),
route("api/grocery-lists/:id/items/:itemId", "routes/api/grocery-lists.$id.items.$itemId.ts"),
route("api/grocery-lists/:id/from-meal", "routes/api/grocery-lists.$id.from-meal.ts"),
route("api/grocery-lists/:id/share", "routes/api/grocery-lists.$id.share.ts"),
route("api/grocery-lists/:id/export", "routes/api/grocery-lists.$id.export.ts"),
```

---

## Files Created/Modified

### New Files
- `app/db/schema.ts` - Added groceryList, groceryItem tables
- `app/lib/grocery.server.ts` - Grocery CRUD operations
- `app/lib/export.server.ts` - Export formatting utilities
- `app/lib/schemas/grocery.ts` - Zod validation schemas
- `app/routes/api/grocery-lists.ts` - Collection API
- `app/routes/api/grocery-lists.$id.ts` - Single list API
- `app/routes/api/grocery-lists.$id.items.ts` - Items API
- `app/routes/api/grocery-lists.$id.items.$itemId.ts` - Single item API
- `app/routes/api/grocery-lists.$id.from-meal.ts` - Meal integration
- `app/routes/api/grocery-lists.$id.share.ts` - Share management
- `app/routes/api/grocery-lists.$id.export.ts` - Export endpoint
- `app/routes/shared.$token.tsx` - Public share view
- `app/routes/dashboard/grocery.tsx` - Dashboard page
- `app/components/supply/GroceryList.tsx` - Main component
- `app/components/supply/GroceryItem.tsx` - Item row component
- `app/components/supply/AddItemForm.tsx` - Add item form
- `app/components/supply/ShareModal.tsx` - Share dialog
- `app/components/supply/ExportMenu.tsx` - Export dropdown
- `drizzle/0004_long_imperial_guard.sql` - Migration

### Modified Files
- `app/routes.ts` - Added new route definitions

---

## Usage Examples

### Create a Grocery List
```typescript
fetch('/api/grocery-lists', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Weekly Shopping' })
});
```

### Add Item to List
```typescript
fetch('/api/grocery-lists/{listId}/items', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Milk',
    quantity: 2,
    unit: 'liters',
    category: 'perishable'
  })
});
```

### Generate Share Link
```typescript
const response = await fetch('/api/grocery-lists/{listId}/share', {
  method: 'POST'
});
const { shareUrl } = await response.json();
// shareUrl: "https://app.com/shared/abc123def456"
```

### Add Missing Meal Ingredients
```typescript
fetch('/api/grocery-lists/{listId}/from-meal', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mealId: '{mealId}' })
});
```

---

## Security Considerations

1. **Authorization**: All grocery list operations verify user ownership
2. **Share Tokens**: 7-day expiration with revocation support
3. **Public Access**: Shared lists only expose read-only item data
4. **Input Validation**: Zod schemas validate all inputs
5. **Cascade Deletes**: Items automatically removed when list deleted

---

## Next Steps (Phase 5)

The grocery list feature completes the core planning loop:
- Inventory → Meals → Matching → Grocery Lists

Future phases may include:
- Bulk ingestion via text/OCR
- Purchase completion → inventory transfer
- Smart suggestions based on purchase history
- Budget tracking per list
