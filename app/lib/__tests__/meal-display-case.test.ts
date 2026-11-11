import { afterEach, describe, expect, it } from "vitest";
import { MealSchema, ProvisionSchema } from "~/lib/schemas/meal";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";
import { getMealsForPicker } from "../manifest.server";
import { compareMealNamesNoCase, storedMealName } from "../meal-name";
import {
	createMeal,
	createMeals,
	createProvision,
	createProvisionFromCargo,
	updateMeal,
} from "../meals.server";

const databases: Array<ReturnType<typeof createSqliteD1>["sqlite"]> = [];

afterEach(() => {
	for (const database of databases.splice(0)) database.close();
});

function setupMealDb() {
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

describe("storedMealName", () => {
	it("trims and keeps the typed case", () => {
		expect(storedMealName("  BBQ Chicken  ")).toBe("BBQ Chicken");
	});
});

describe("compareMealNamesNoCase", () => {
	it("groups mixed-case names and does not lift capitals above the alphabet", () => {
		const names = ["zucchini", "Banana Bread", "apple pie", "Apple Pie"];
		const sorted = [...names].sort(compareMealNamesNoCase);
		const appleIndexes = sorted.flatMap((name, index) =>
			name.toLowerCase() === "apple pie" ? [index] : [],
		);
		expect(appleIndexes).toEqual([0, 1]);
		expect(sorted[2]).toBe("Banana Bread");
		expect(sorted[3]).toBe("zucchini");
	});
});

describe("meal display case", () => {
	it("stores BBQ Chicken as typed", async () => {
		const db = setupMealDb();
		const input = MealSchema.parse({
			name: "  BBQ Chicken  ",
			servings: 4,
			ingredients: [],
		});
		const created = await createMeal(db, "org-1", input);
		expect(created?.name).toBe("BBQ Chicken");
	});

	it("stores each batched meal name as typed", async () => {
		const db = setupMealDb();
		const created = await createMeals(db, "org-1", [
			MealSchema.parse({ name: "Apple Pie", ingredients: [] }),
			MealSchema.parse({ name: "banana bread", ingredients: [] }),
		]);
		expect(created.map((meal) => meal.name).sort()).toEqual([
			"Apple Pie",
			"banana bread",
		]);
	});

	it("keeps case on update", async () => {
		const db = setupMealDb();
		const created = await createMeal(
			db,
			"org-1",
			MealSchema.parse({ name: "apple pie", ingredients: [] }),
		);
		expect(created).not.toBeNull();
		if (!created) return;
		const updated = await updateMeal(
			db,
			"org-1",
			created.id,
			MealSchema.parse({ name: "Apple Pie", servings: 8, ingredients: [] }),
		);
		expect(updated?.name).toBe("Apple Pie");
	});

	it("stores a provision name as typed", async () => {
		const db = setupMealDb();
		const created = await createProvision(
			db,
			"org-1",
			ProvisionSchema.parse({
				name: "  Greek Yogurt  ",
				quantity: 200,
				unit: "g",
			}),
		);
		expect(created?.name).toBe("Greek Yogurt");
	});

	it("stores a cargo-linked provision name as typed", async () => {
		const db = setupMealDb();
		await db
			.prepare(
				`INSERT INTO cargo (id, organization_id, name, quantity, unit, domain)
				 VALUES ('cargo-1', 'org-1', 'Greek Yogurt', 1, 'g', 'food')`,
			)
			.run();
		const created = await createProvisionFromCargo(db, "org-1", "cargo-1");
		expect(created.provision?.name).toBe("Greek Yogurt");
	});

	it("sorts the meal picker case-insensitively without rewriting names", async () => {
		const db = setupMealDb();
		const rows = [
			["m-z", "zucchini"],
			["m-b", "Banana Bread"],
			["m-a", "apple pie"],
			["m-A", "Apple Pie"],
		] as const;
		for (const [id, name] of rows) {
			await db
				.prepare(
					`INSERT INTO meal (id, organization_id, name, servings, type)
					 VALUES (?, 'org-1', ?, 1, 'recipe')`,
				)
				.bind(id, name)
				.run();
		}

		const meals = await getMealsForPicker(db, "org-1");
		const names = meals.map((meal) => meal.name);
		expect(names).toContain("Apple Pie");
		expect(names).toContain("apple pie");
		expect(names).toContain("Banana Bread");
		const appleIndexes = names.flatMap((name, index) =>
			name.toLowerCase() === "apple pie" ? [index] : [],
		);
		expect(appleIndexes).toHaveLength(2);
		expect(Math.abs((appleIndexes[0] ?? 0) - (appleIndexes[1] ?? 0))).toBe(1);
		expect(Math.max(...appleIndexes)).toBeLessThan(
			names.indexOf("Banana Bread"),
		);
		expect(names.indexOf("Banana Bread")).toBeLessThan(
			names.indexOf("zucchini"),
		);
	});
});
