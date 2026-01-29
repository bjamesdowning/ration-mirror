# Migration 0006 Failure Analysis & Fix

## Problem

Migration `0006_wealthy_steve_rogers.sql` is failing in production with:
```
FOREIGN KEY constraint failed: SQLITE_CONSTRAINT [code: 7500]
```

## Root Cause

The migration assumes `organization_id` columns already exist in production tables with valid data. However, the production database still has the OLD schema with `userId` columns, not `organizationId`.

**Migration 0006 tries to**:
```sql
INSERT INTO `__new_inventory`(..., "organization_id", ...) 
SELECT ..., "organization_id", ... FROM `inventory`;
```

**But "organization_id" doesn't exist in the old `inventory` table!**

---

## Solution: Create Fixed Data Migration

We need a custom migration that:
1. Creates the new organization tables (if not exist)
2. FOR EACH USER: Creates a personal organization
3. Migrates data from userId to organizationId
4. Then applies the schema changes

###  Fixed Migration: `drizzle/0006a_migrate_users_to_organizations.sql`

```sql
-- Step 1: Ensure organization tables exist (from 0005)
-- (Already created by 0005, so skip)

-- Step 2: Create personal organizations for all existing users
-- AND migrate their data to those organizations

-- For each user, we need to:
-- a) Create personal organization
-- b) Add user as owner in member table
-- c) Migrate all their data (inventory, meals, grocery_list, ledger) to that organization

-- We'll do this via a series of inserts with SELECT statements

-- First, insert organizations for all users (if they don't have one already)
INSERT INTO organization (id, name, slug, logo, metadata, created_at, credits)
SELECT 
    'personal-' || user.id,  -- Generate deterministic org ID
    user.name || '''s Personal Group',
    'personal-' || user.id,
    NULL,
    '{"isPersonal":true}',
    user.created_at,
    COALESCE(user.credits, 0)  -- Migrate credits from user to org
FROM user
WHERE NOT EXISTS (
    SELECT 1 FROM organization WHERE id = 'personal-' || user.id
);

-- Second, add users as owners of their personal organizations
INSERT INTO member (id, organization_id, user_id, role, created_at)
SELECT 
    'member-' || user.id,
    'personal-' || user.id,
    user.id,
    'owner',
    user.created_at
FROM user
WHERE NOT EXISTS (
    SELECT 1 FROM member WHERE organization_id = 'personal-' || user.id AND user_id = user.id
);

-- Step 3: Now we can safely add organization_id columns and migrate data

-- Inventory Migration (if table has data)
-- Add temporary column first
ALTER TABLE inventory ADD COLUMN organization_id_temp TEXT;

-- Populate with user's personal org ID (join not supported in UPDATE, so use subquery)
UPDATE inventory 
SET organization_id_temp = 'personal-' || user_id
WHERE user_id IS NOT NULL;

-- Remove old userId column, add proper organizationId
-- (SQLite doesn't support DROP COLUMN or ADD CONSTRAINT, so table recreation needed)
CREATE TABLE inventory_new (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit TEXT NOT NULL,
    tags TEXT DEFAULT '[]' NOT NULL,
    category TEXT DEFAULT 'other' NOT NULL,
    status TEXT DEFAULT 'stable' NOT NULL,
    expires_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE
);

INSERT INTO inventory_new (id, organization_id, name, quantity, unit, tags, category, status, expires_at, created_at, updated_at)
SELECT id, organization_id_temp, name, quantity, unit, tags, category, status, expires_at, created_at, updated_at  
FROM inventory;

DROP TABLE inventory;
ALTER TABLE inventory_new RENAME TO inventory;

-- Recreate indexes
CREATE INDEX inventory_org_idx ON inventory (organization_id);
CREATE INDEX inventory_category_idx ON inventory (organization_id, category);

-- Repeat similar pattern for:
-- - meal
-- - grocery_list  
-- - ledger

-- (Full SQL would be very long, see recommendation below)
```

---

## Recommended Approach

The generated migrations assume data already has `organizationId`, but production doesn't. You have TWO OPTIONS:

### Option 1: Manual Data Migration (SAFEST for production with existing users)

1. **Before running migrations**, run a custom SQL script to:
   - Create organizations for each user
   - Populate organizationId on all data tables
   - Then run the auto-generated migrations

2. Use the Wranglerr D1 execute command:
```bash
wrangler d1 execute DB --remote --command="
-- Your migration SQL here
"
```

### Option 2: Fresh Start (IF NO PRODUCTION DATA YET)

If there's no production data worth keeping:

```bash
# Drop all tables and start fresh
wrangler d1 execute DB --remote --command="
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS meal;
DROP TABLE IF EXISTS meal_ingredient;
DROP TABLE IF EXISTS meal_tag;
DROP TABLE IF EXISTS grocery_list;
DROP TABLE IF EXISTS grocery_item;
DROP TABLE IF EXISTS ledger;
DROP TABLE IF EXISTS invitation;
DROP TABLE IF EXISTS member;
DROP TABLE IF EXISTS organization;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS account;
DROP TABLE IF EXISTS verification;
DROP TABLE IF EXISTS user;
DROP TABLE IF EXISTS _cf_KV;
"

# Then run migrations from scratch
bun run db:migrate:prod
```

---

## Correct Migration Sequence

The CORRECT order should be:

1. **0005**: Create organization tables (✅ Success)
2. **0006-data**: Migrate users to personal organizations + populate organizationId
3. **0006-schema**: Recreate tables with FK constraints
4. **0007**: Remove user.credits column

---

## Immediate Action

I recommend **Option 2 (Fresh Start)** if there's no critical production data. Otherwise, we need to write a manual data migration script.

**Which option would you like to proceed with?**
