/**
 * Drizzle mirror of ration-nutrition D1 schema.
 * Apply SQL via nutrition-db/schema.sql (+ migrations/ for upgrades).
 * Never promote seed-minimal.sql to production reviewers.
 */
import {
	index,
	integer,
	real,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

export const food = sqliteTable(
	"food",
	{
		fdcId: integer("fdc_id").primaryKey(),
		description: text("description").notNull(),
		dataType: text("data_type").notNull().default("sr_legacy_food"),
	},
	(table) => [
		index("idx_food_description").on(table.description),
		index("idx_food_data_type").on(table.dataType),
	],
);

export const foodNutrient = sqliteTable("food_nutrient", {
	fdcId: integer("fdc_id")
		.primaryKey()
		.references(() => food.fdcId, { onDelete: "cascade" }),
	energyKcal: real("energy_kcal"),
	proteinG: real("protein_g"),
	fatG: real("fat_g"),
	carbG: real("carb_g"),
	fiberG: real("fiber_g"),
	sugarG: real("sugar_g"),
	satFatG: real("sat_fat_g"),
	sodiumMg: real("sodium_mg"),
	saltG: real("salt_g"),
	energyNutrientId: integer("energy_nutrient_id"),
	saltDerivation: text("salt_derivation"),
});

export const foodPortion = sqliteTable(
	"food_portion",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		fdcId: integer("fdc_id")
			.notNull()
			.references(() => food.fdcId, { onDelete: "cascade" }),
		modifier: text("modifier"),
		gramWeight: real("gram_weight").notNull(),
		amount: real("amount"),
		measureUnit: text("measure_unit"),
	},
	(table) => [index("idx_food_portion_fdc").on(table.fdcId)],
);

export const datasetRelease = sqliteTable("dataset_release", {
	id: text("id").primaryKey(),
	dataType: text("data_type").notNull(),
	officialUrl: text("official_url"),
	publicationDate: text("publication_date"),
	archiveSha256: text("archive_sha256"),
	importedAt: integer("imported_at").notNull(),
	rowCountFood: integer("row_count_food").notNull().default(0),
	rowCountNutrient: integer("row_count_nutrient").notNull().default(0),
	rowCountPortion: integer("row_count_portion").notNull().default(0),
});

export const databaseSnapshot = sqliteTable("database_snapshot", {
	id: text("id").primaryKey(),
	createdAt: integer("created_at").notNull(),
	snapshotHash: text("snapshot_hash").notNull(),
	matcherFloor: text("matcher_floor").notNull(),
	releaseIdsJson: text("release_ids_json").notNull(),
	notes: text("notes"),
});
