import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPersonalOrgRecords } from "~/lib/agent/org-records.server";
import { AGENT_STUB_EMAIL_DOMAIN } from "~/lib/agent/stub-user";
import {
	buildStarterMealStatements,
	getStarterMealRecipeShape,
	STARTER_MEAL_NAME,
	STARTER_MEAL_SEED_KEY,
	seedStarterMealIfNeeded,
	shouldSeedStarterMeal,
} from "~/lib/starter-meal.server";

describe("starter meal", () => {
	const batchMock = vi.fn();
	const selectMock = vi.fn();
	const insertMock = vi.fn();
	const insertValuesMock = vi.fn();

	function mockDb(existingIds: string[] = []) {
		selectMock.mockReturnValue({
			from: () => ({
				where: () => ({
					limit: () => Promise.resolve(existingIds.map((id) => ({ id }))),
				}),
			}),
		});
		insertValuesMock.mockImplementation((values: unknown) => ({
			kind: "insert",
			values,
		}));
		insertMock.mockReturnValue({ values: insertValuesMock });
		batchMock.mockResolvedValue(undefined);
		return {
			batch: batchMock,
			select: selectMock,
			insert: insertMock,
		} as never;
	}

	beforeEach(() => {
		batchMock.mockReset();
		selectMock.mockReset();
		insertMock.mockReset();
		insertValuesMock.mockReset();
	});

	it("exposes a realistic hot chocolate recipe shape", () => {
		const shape = getStarterMealRecipeShape();
		expect(shape.seedKey).toBe(STARTER_MEAL_SEED_KEY);
		expect(shape.name).toBe(STARTER_MEAL_NAME);
		expect(shape.ingredients).toEqual([
			{ ingredientName: "milk", quantity: 250, unit: "ml", cargoId: null },
			{
				ingredientName: "cocoa powder",
				quantity: 2,
				unit: "tbsp",
				cargoId: null,
			},
			{ ingredientName: "sugar", quantity: 1, unit: "tbsp", cargoId: null },
		]);
		expect(shape.directions).toHaveLength(4);
		expect(shape.directions[0]?.text).toMatch(/milk/i);
		expect(shape.directions[1]?.text).toMatch(/cocoa powder/i);
		expect(shape.equipment).toEqual(["saucepan", "whisk"]);
		expect(shape.servings).toBe(1);
		expect(shape.prepTime).toBe(2);
		expect(shape.cookTime).toBe(5);
	});

	it("skips agent stub emails", () => {
		expect(shouldSeedStarterMeal("billy@example.com")).toBe(true);
		expect(shouldSeedStarterMeal(null)).toBe(true);
		expect(shouldSeedStarterMeal(`agent+abc${AGENT_STUB_EMAIL_DOMAIN}`)).toBe(
			false,
		);
	});

	it("buildStarterMealStatements inserts meal + three ingredients", () => {
		const db = mockDb();
		const { mealInsert, ingredientInsert } = buildStarterMealStatements(
			db,
			"org_1",
			"meal_fixed",
		);
		expect(insertMock).toHaveBeenCalledTimes(2);
		expect(insertValuesMock).toHaveBeenCalledTimes(2);
		const mealValues = insertValuesMock.mock.calls[0]?.[0] as {
			id: string;
			name: string;
			customFields: { seedKey: string };
			directions: string;
			equipment: string[];
		};
		expect(mealValues.id).toBe("meal_fixed");
		expect(mealValues.name).toBe(STARTER_MEAL_NAME);
		expect(mealValues.customFields.seedKey).toBe(STARTER_MEAL_SEED_KEY);
		expect(mealValues.equipment).toEqual(["saucepan", "whisk"]);
		expect(JSON.parse(mealValues.directions)).toHaveLength(4);

		const ingredientValues = insertValuesMock.mock.calls[1]?.[0] as Array<{
			ingredientName: string;
			cargoId: null;
			quantity: number;
			unit: string;
		}>;
		expect(ingredientValues).toHaveLength(3);
		expect(ingredientValues.map((i) => i.ingredientName)).toEqual([
			"milk",
			"cocoa powder",
			"sugar",
		]);
		expect(ingredientValues.every((i) => i.cargoId === null)).toBe(true);
		expect(mealInsert).toBeDefined();
		expect(ingredientInsert).toBeDefined();
	});

	it("seedStarterMealIfNeeded inserts once then no-ops", async () => {
		const db = mockDb([]);
		const first = await seedStarterMealIfNeeded(db, "org_1", "a@b.com");
		expect(first).toBe(true);
		expect(batchMock).toHaveBeenCalledTimes(1);

		const dbExisting = mockDb(["m1"]);
		const second = await seedStarterMealIfNeeded(
			dbExisting,
			"org_1",
			"a@b.com",
		);
		expect(second).toBe(false);
		expect(batchMock).toHaveBeenCalledTimes(1);
	});

	it("seedStarterMealIfNeeded skips agents without querying", async () => {
		const db = mockDb();
		const inserted = await seedStarterMealIfNeeded(
			db,
			"org_1",
			`agent+x${AGENT_STUB_EMAIL_DOMAIN}`,
		);
		expect(inserted).toBe(false);
		expect(selectMock).not.toHaveBeenCalled();
		expect(batchMock).not.toHaveBeenCalled();
	});

	it("keeps buildPersonalOrgRecords free of meal fields", () => {
		const records = buildPersonalOrgRecords("user_1", "Billy");
		expect(records.orgValues).toMatchObject({
			slug: "personal-user_1",
			metadata: { isPersonal: true },
		});
		expect(records).not.toHaveProperty("mealValues");
		expect(Object.keys(records).sort()).toEqual([
			"memberValues",
			"orgId",
			"orgValues",
		]);
	});
});
