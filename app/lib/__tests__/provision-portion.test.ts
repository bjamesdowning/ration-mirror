import { afterEach, describe, expect, it } from "vitest";
import { ensureProvisionFromCargo } from "~/lib/meals.server";
import {
	clampIntakeServings,
	cookServingsForCargoAmount,
	isStockShapedProvision,
	resolveProvisionUnitPortion,
	resolveProvisionUnitPortionFromRaw,
} from "~/lib/provision-portion";
import { convertQuantity } from "~/lib/units";
import { createMockEnv } from "~/test/helpers/mock-env";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";

const databases: Array<ReturnType<typeof createSqliteD1>["sqlite"]> = [];

afterEach(() => {
	for (const database of databases.splice(0)) database.close();
});

function setupProvisionDb() {
	const { database, sqlite } = createSqliteD1();
	databases.push(sqlite);
	sqlite.exec(`
		CREATE TABLE meal (
			id TEXT PRIMARY KEY,
			organization_id TEXT NOT NULL,
			name TEXT NOT NULL,
			domain TEXT NOT NULL DEFAULT 'food',
			type TEXT NOT NULL DEFAULT 'recipe',
			description TEXT,
			directions TEXT,
			equipment TEXT DEFAULT '[]',
			servings INTEGER DEFAULT 1,
			prep_time INTEGER,
			cook_time INTEGER,
			custom_fields TEXT DEFAULT '{}',
			nutrition TEXT,
			nutrition_revision INTEGER NOT NULL DEFAULT 0,
			nutrition_computed_revision INTEGER NOT NULL DEFAULT 0,
			nutrition_status TEXT NOT NULL DEFAULT 'current',
			nutrition_updated_at INTEGER,
			import_request_id TEXT,
			created_at INTEGER NOT NULL DEFAULT (unixepoch()),
			updated_at INTEGER NOT NULL DEFAULT (unixepoch())
		);
		CREATE TABLE meal_ingredient (
			id TEXT PRIMARY KEY,
			meal_id TEXT NOT NULL,
			cargo_id TEXT,
			ingredient_name TEXT NOT NULL,
			quantity REAL NOT NULL,
			unit TEXT NOT NULL,
			base_quantity REAL NOT NULL DEFAULT 1,
			base_unit TEXT NOT NULL DEFAULT 'unit',
			is_optional INTEGER DEFAULT 0,
			order_index INTEGER DEFAULT 0
		);
		CREATE TABLE tag (
			id TEXT PRIMARY KEY,
			organization_id TEXT NOT NULL,
			slug TEXT NOT NULL,
			name TEXT NOT NULL,
			color TEXT,
			category TEXT,
			created_by TEXT,
			created_at INTEGER NOT NULL DEFAULT (unixepoch())
		);
		CREATE TABLE meal_tag (
			meal_id TEXT NOT NULL,
			tag_id TEXT NOT NULL,
			PRIMARY KEY (meal_id, tag_id)
		);
		CREATE TABLE cargo (
			id TEXT PRIMARY KEY,
			organization_id TEXT NOT NULL,
			name TEXT NOT NULL,
			quantity REAL NOT NULL,
			unit TEXT NOT NULL,
			base_quantity REAL NOT NULL DEFAULT 1,
			base_unit TEXT NOT NULL DEFAULT 'unit',
			domain TEXT NOT NULL DEFAULT 'food',
			status TEXT NOT NULL DEFAULT 'stable',
			expires_at INTEGER,
			nutrition TEXT,
			created_at INTEGER NOT NULL DEFAULT (unixepoch()),
			updated_at INTEGER NOT NULL DEFAULT (unixepoch())
		);
		CREATE TABLE cargo_tag (
			cargo_id TEXT NOT NULL,
			tag_id TEXT NOT NULL,
			PRIMARY KEY (cargo_id, tag_id)
		);
	`);
	return database;
}

function provisionEnv(db: D1Database): Env {
	return { ...createMockEnv(), DB: db };
}

async function seedLinkedProvision(input: {
	cargoId: string;
	cargoQuantity: number;
	cargoUnit: string;
	ingredientQuantity: number;
	ingredientUnit: string;
}) {
	const db = setupProvisionDb();
	await db
		.prepare(
			`INSERT INTO cargo (id, organization_id, name, quantity, unit, domain)
			 VALUES (?, 'org-1', 'Carrot', ?, ?, 'food')`,
		)
		.bind(input.cargoId, input.cargoQuantity, input.cargoUnit)
		.run();
	await db
		.prepare(
			`INSERT INTO meal (id, organization_id, name, type, servings)
			 VALUES (?, 'org-1', 'Carrot', 'provision', 1)`,
		)
		.bind(`meal-${input.cargoId}`)
		.run();
	await db
		.prepare(
			`INSERT INTO meal_ingredient (
				id, meal_id, cargo_id, ingredient_name, quantity, unit
			 ) VALUES (?, ?, ?, 'Carrot', ?, ?)`,
		)
		.bind(
			`ing-${input.cargoId}`,
			`meal-${input.cargoId}`,
			input.cargoId,
			input.ingredientQuantity,
			input.ingredientUnit,
		)
		.run();
	return db;
}

describe("resolveProvisionUnitPortion", () => {
	it("uses 1 for count units", () => {
		expect(resolveProvisionUnitPortion("unit")).toBe(1);
		expect(resolveProvisionUnitPortion("piece")).toBe(1);
		expect(resolveProvisionUnitPortion("can")).toBe(1);
	});

	it("uses household mass/volume defaults", () => {
		expect(resolveProvisionUnitPortion("g")).toBe(100);
		expect(resolveProvisionUnitPortion("kg")).toBe(0.1);
		expect(resolveProvisionUnitPortion("oz")).toBe(4);
		expect(resolveProvisionUnitPortion("ml")).toBe(100);
	});

	it("normalizes raw unit aliases", () => {
		expect(resolveProvisionUnitPortionFromRaw("grams")).toEqual({
			quantity: 100,
			unit: "g",
		});
	});
});

describe("isStockShapedProvision", () => {
	it("detects full-stock promote (12 units in pantry as one serving)", () => {
		expect(
			isStockShapedProvision({
				mealServings: 1,
				ingredientQuantity: 12,
				ingredientUnit: "unit",
				cargoQuantity: 12,
				cargoUnit: "unit",
			}),
		).toBe(true);
	});

	it("detects emptied cargo after stock-dump promote", () => {
		expect(
			isStockShapedProvision({
				mealServings: 1,
				ingredientQuantity: 12,
				ingredientUnit: "unit",
				cargoQuantity: 0,
				cargoUnit: "unit",
			}),
		).toBe(true);
	});

	it("does not flag a correct unit-portion provision", () => {
		expect(
			isStockShapedProvision({
				mealServings: 1,
				ingredientQuantity: 1,
				ingredientUnit: "unit",
				cargoQuantity: 12,
				cargoUnit: "unit",
			}),
		).toBe(false);
	});

	it("does not flag a user-edited 2-unit snack portion", () => {
		expect(
			isStockShapedProvision({
				mealServings: 1,
				ingredientQuantity: 2,
				ingredientUnit: "unit",
				cargoQuantity: 12,
				cargoUnit: "unit",
			}),
		).toBe(false);
	});

	it("does not flag when mealServings is not 1", () => {
		expect(
			isStockShapedProvision({
				mealServings: 4,
				ingredientQuantity: 12,
				ingredientUnit: "unit",
				cargoQuantity: 12,
				cargoUnit: "unit",
			}),
		).toBe(false);
	});
});

describe("cookServingsForCargoAmount", () => {
	it("maps 1 of 1-unit portion to 1 serving", () => {
		expect(
			cookServingsForCargoAmount({
				requestedQuantity: 1,
				requestedUnit: "unit",
				ingredientQuantity: 1,
				ingredientUnit: "unit",
			}),
		).toBe(1);
	});

	it("maps 200g against 100g portion to 2 servings", () => {
		expect(
			cookServingsForCargoAmount({
				requestedQuantity: 200,
				requestedUnit: "g",
				ingredientQuantity: 100,
				ingredientUnit: "g",
			}),
		).toBe(2);
	});

	it("returns null on unit family mismatch", () => {
		expect(
			cookServingsForCargoAmount({
				requestedQuantity: 1,
				requestedUnit: "unit",
				ingredientQuantity: 100,
				ingredientUnit: "g",
			}),
		).toBeNull();
	});
});

describe("clampIntakeServings", () => {
	it("clamps below 0.01 and above 100", () => {
		expect(clampIntakeServings(0.001)).toEqual({
			servings: 0.01,
			clamped: true,
		});
		expect(clampIntakeServings(0.1)).toEqual({
			servings: 0.1,
			clamped: false,
		});
		expect(clampIntakeServings(150)).toEqual({ servings: 100, clamped: true });
		expect(clampIntakeServings(2)).toEqual({ servings: 2, clamped: false });
	});
});

describe("mealNutritionIsUsable", () => {
	it("requires a resolved aggregate instead of accepting zero-filled energy", async () => {
		const { mealNutritionIsUsable } = await import("~/lib/meals.server");
		expect(mealNutritionIsUsable(null)).toBe(false);
		expect(
			mealNutritionIsUsable({
				perServing: { energyKcal: 0, proteinG: 0, carbG: 0, fatG: 0 },
				coverage: 0,
				attributions: [],
			}),
		).toBe(false);
	});

	it("accepts a resolved zero-calorie food", async () => {
		const { mealNutritionIsUsable } = await import("~/lib/meals.server");
		expect(
			mealNutritionIsUsable({
				perServing: { energyKcal: 0, proteinG: 0, carbG: 0, fatG: 0 },
				coverage: 1,
				attributions: [{ ingredientName: "sparkling water" }],
			}),
		).toBe(true);
	});

	it("accepts a covered provision with complete macros (persisted carbG)", async () => {
		const { mealNutritionIsUsable } = await import("~/lib/meals.server");
		expect(
			mealNutritionIsUsable({
				perServing: { energyKcal: 120, proteinG: 20, carbG: 0, fatG: 4 },
				coverage: 1,
				attributions: [{ ingredientName: "steak" }],
			}),
		).toBe(true);
	});

	it("accepts wire-alias carbsG when carbG is absent", async () => {
		const { mealNutritionIsUsable } = await import("~/lib/meals.server");
		expect(
			mealNutritionIsUsable({
				perServing: { energyKcal: 90, proteinG: 10, carbsG: 5, fatG: 2 },
				coverage: 1,
				attributions: [{ ingredientName: "yogurt" }],
			}),
		).toBe(true);
	});
});

describe("ensureProvisionFromCargo stock quantity", () => {
	it("rewrites a row still sitting on 4 oz to the cargo quantity", async () => {
		const ounces = convertQuantity(15, "g", "oz");
		expect(ounces).not.toBeNull();
		if (ounces == null) return;
		const db = await seedLinkedProvision({
			cargoId: "cargo-oz",
			cargoQuantity: ounces,
			cargoUnit: "oz",
			ingredientQuantity: 4,
			ingredientUnit: "oz",
		});
		const env = provisionEnv(db);

		const first = await ensureProvisionFromCargo(env, "org-1", "cargo-oz");
		expect(first.alreadyExisted).toBe(true);
		expect(first.normalized).toBe(true);
		expect(first.provision?.servings).toBe(1);
		expect(first.provision?.ingredients[0]?.unit).toBe("oz");
		expect(first.provision?.ingredients[0]?.quantity).toBeCloseTo(ounces, 8);
		expect(first.provision?.ingredients[0]?.quantity).not.toBe(4);

		const second = await ensureProvisionFromCargo(env, "org-1", "cargo-oz");
		expect(second.normalized).toBe(false);
		expect(second.provision?.ingredients[0]?.unit).toBe("oz");
		expect(second.provision?.ingredients[0]?.quantity).toBeCloseTo(ounces, 8);
	});

	it("rewrites a row still sitting on 100 g to the cargo quantity", async () => {
		const db = await seedLinkedProvision({
			cargoId: "cargo-g",
			cargoQuantity: 15,
			cargoUnit: "g",
			ingredientQuantity: 100,
			ingredientUnit: "g",
		});
		const result = await ensureProvisionFromCargo(
			provisionEnv(db),
			"org-1",
			"cargo-g",
		);
		expect(result.alreadyExisted).toBe(true);
		expect(result.normalized).toBe(true);
		expect(result.provision?.servings).toBe(1);
		expect(result.provision?.ingredients[0]?.quantity).toBe(15);
		expect(result.provision?.ingredients[0]?.unit).toBe("g");
	});

	it("leaves a row edited to 3 oz", async () => {
		const ounces = convertQuantity(15, "g", "oz");
		expect(ounces).not.toBeNull();
		if (ounces == null) return;
		const db = await seedLinkedProvision({
			cargoId: "cargo-edited",
			cargoQuantity: ounces,
			cargoUnit: "oz",
			ingredientQuantity: 3,
			ingredientUnit: "oz",
		});
		const result = await ensureProvisionFromCargo(
			provisionEnv(db),
			"org-1",
			"cargo-edited",
		);
		expect(result.normalized).toBe(false);
		expect(result.provision?.ingredients[0]?.quantity).toBe(3);
		expect(result.provision?.ingredients[0]?.unit).toBe("oz");
	});

	it("does not replace a matching stock quantity with 4 oz or 100 g", async () => {
		const ounceDb = await seedLinkedProvision({
			cargoId: "cargo-stock-oz",
			cargoQuantity: 15,
			cargoUnit: "oz",
			ingredientQuantity: 15,
			ingredientUnit: "oz",
		});
		const ounceResult = await ensureProvisionFromCargo(
			provisionEnv(ounceDb),
			"org-1",
			"cargo-stock-oz",
		);
		expect(ounceResult.normalized).toBe(false);
		expect(ounceResult.provision?.ingredients[0]?.quantity).toBe(15);
		expect(ounceResult.provision?.ingredients[0]?.unit).toBe("oz");

		const gramDb = await seedLinkedProvision({
			cargoId: "cargo-stock-g",
			cargoQuantity: 250,
			cargoUnit: "g",
			ingredientQuantity: 250,
			ingredientUnit: "g",
		});
		const gramResult = await ensureProvisionFromCargo(
			provisionEnv(gramDb),
			"org-1",
			"cargo-stock-g",
		);
		expect(gramResult.normalized).toBe(false);
		expect(gramResult.provision?.ingredients[0]?.quantity).toBe(250);
		expect(gramResult.provision?.ingredients[0]?.unit).toBe("g");
	});
});
