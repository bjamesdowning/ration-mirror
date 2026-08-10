-- Curated / learned pantry name → FDC id map (global, on NUTRITION_DB).
CREATE TABLE IF NOT EXISTS food_alias (
	normalized_name TEXT PRIMARY KEY NOT NULL,
	fdc_id INTEGER NOT NULL REFERENCES food(fdc_id) ON DELETE CASCADE,
	locale TEXT NOT NULL DEFAULT 'en',
	source TEXT NOT NULL DEFAULT 'curated',
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_food_alias_fdc ON food_alias(fdc_id);
