-- Additive release / snapshot metadata for ration-nutrition.
-- Fresh installs: prefer nutrition-db/schema.sql (already includes these tables/columns).
-- Existing DBs created before provenance columns: run the ALTERs below once.
-- If ALTER fails with "duplicate column name", columns already exist — continue.

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

-- Provenance columns (skip if already present on this DB).
-- ALTER TABLE food_nutrient ADD COLUMN energy_nutrient_id INTEGER;
-- ALTER TABLE food_nutrient ADD COLUMN salt_derivation TEXT;
