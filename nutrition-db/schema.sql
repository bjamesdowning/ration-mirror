-- ration-nutrition D1 schema (USDA-shaped, app-owned)
-- Apply: wrangler d1 execute ration-nutrition --local --file=nutrition-db/schema.sql
-- Additive upgrades: nutrition-db/migrations/*.sql

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS food (
	fdc_id INTEGER PRIMARY KEY NOT NULL,
	description TEXT NOT NULL,
	data_type TEXT NOT NULL DEFAULT 'sr_legacy_food'
);

CREATE TABLE IF NOT EXISTS food_nutrient (
	fdc_id INTEGER PRIMARY KEY NOT NULL REFERENCES food(fdc_id) ON DELETE CASCADE,
	energy_kcal REAL,
	protein_g REAL,
	fat_g REAL,
	carb_g REAL,
	fiber_g REAL,
	sugar_g REAL,
	sat_fat_g REAL,
	sodium_mg REAL,
	salt_g REAL,
	energy_nutrient_id INTEGER,
	salt_derivation TEXT
);

CREATE TABLE IF NOT EXISTS food_portion (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	fdc_id INTEGER NOT NULL REFERENCES food(fdc_id) ON DELETE CASCADE,
	modifier TEXT,
	gram_weight REAL NOT NULL,
	amount REAL,
	measure_unit TEXT
);

CREATE TABLE IF NOT EXISTS dataset_release (
	id TEXT PRIMARY KEY NOT NULL,
	data_type TEXT NOT NULL,
	official_url TEXT,
	publication_date TEXT,
	archive_sha256 TEXT,
	imported_at INTEGER NOT NULL,
	row_count_food INTEGER NOT NULL DEFAULT 0,
	row_count_nutrient INTEGER NOT NULL DEFAULT 0,
	row_count_portion INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS database_snapshot (
	id TEXT PRIMARY KEY NOT NULL,
	created_at INTEGER NOT NULL,
	snapshot_hash TEXT NOT NULL,
	matcher_floor TEXT NOT NULL,
	release_ids_json TEXT NOT NULL,
	notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_food_description ON food(description);
CREATE INDEX IF NOT EXISTS idx_food_data_type ON food(data_type);
CREATE INDEX IF NOT EXISTS idx_food_portion_fdc ON food_portion(fdc_id);

-- External-content FTS5; populate after seeding food rows (see seed-minimal.sql).
CREATE VIRTUAL TABLE IF NOT EXISTS food_fts USING fts5(
	description,
	content='food',
	content_rowid='fdc_id'
);
