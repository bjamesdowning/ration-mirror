-- ration-nutrition D1 schema (USDA-shaped, app-owned)
-- Apply: wrangler d1 execute ration-nutrition --local --file=nutrition-db/schema.sql

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS food (
	fdc_id INTEGER PRIMARY KEY NOT NULL,
	description TEXT NOT NULL,
	data_type TEXT NOT NULL DEFAULT 'sr_legacy'
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
	salt_g REAL
);

CREATE TABLE IF NOT EXISTS food_portion (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	fdc_id INTEGER NOT NULL REFERENCES food(fdc_id) ON DELETE CASCADE,
	modifier TEXT,
	gram_weight REAL NOT NULL,
	amount REAL,
	measure_unit TEXT
);

CREATE INDEX IF NOT EXISTS idx_food_description ON food(description);
CREATE INDEX IF NOT EXISTS idx_food_portion_fdc ON food_portion(fdc_id);

-- External-content FTS5; populate after seeding food rows (see seed-minimal.sql).
CREATE VIRTUAL TABLE IF NOT EXISTS food_fts USING fts5(
	description,
	content='food',
	content_rowid='fdc_id'
);
