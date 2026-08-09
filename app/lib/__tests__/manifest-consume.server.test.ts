import { beforeEach, describe, expect, it, vi } from "vitest";

const cookMeal = vi.fn();
const getMealMissingIngredients = vi.fn();
const buildCargoDeductionStatements = vi.fn();
const bumpReadinessCacheVersions = vi.fn();

vi.mock("../meals.server", () => ({
	cookMeal: (...args: unknown[]) => cookMeal(...args),
}));

vi.mock("../matching.server", () => ({
	getMealMissingIngredients: (...args: unknown[]) =>
		getMealMissingIngredients(...args),
}));

vi.mock("../cargo-deduction.server", () => ({
	buildCargoDeductionStatements: (...args: unknown[]) =>
		buildCargoDeductionStatements(...args),
}));

vi.mock("../readiness-cache.server", () => ({
	bumpReadinessCacheVersions: (...args: unknown[]) =>
		bumpReadinessCacheVersions(...args),
}));

vi.mock("../kitchen-events.server", () => ({
	buildKitchenEventInserts: () => ({
		stmts: [{ kind: "kitchen-event" }],
		eventIds: ["evt-1"],
	}),
	buildManifestConsumedEvent: (input: unknown) => input,
}));

vi.mock("../feature-flags/flags.server", () => ({
	isFeatureEnabled: (...args: unknown[]) => isFeatureEnabled(...args),
}));

vi.mock("../nutrition/persist.server", () => ({
	buildMinimalFlagContext: () => ({}),
}));

const isFeatureEnabled = vi.fn();

const planId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const entryId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const mealId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const orgId = "org-1";

let selectCall = 0;

const updateWhere = vi.fn().mockResolvedValue(undefined);
const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
const insertValues = vi.fn().mockReturnValue({ kind: "nutrition-intake" });
const batch = vi.fn().mockResolvedValue(undefined);
const deductionStmt = { kind: "cargo-deduction" };

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		select: vi.fn(() => {
			selectCall += 1;
			if (selectCall === 1) {
				return {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					limit: vi.fn().mockResolvedValue([{ id: planId }]),
				};
			}
			return {
				from: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue([
					{
						id: entryId,
						mealId,
						date: "2026-07-30",
						slotType: "dinner",
						servingsOverride: null,
						mealServings: 2,
						mealName: "Pasta",
						mealNutrition: {
							perServing: {
								energyKcal: 500,
								proteinG: 20,
								fatG: 10,
								carbG: 60,
								fiberG: 5,
								sugarG: 2,
								satFatG: 3,
								sodiumMg: 400,
								saltG: 1,
							},
							coverage: 1,
							attributions: [],
							computedAt: "2026-07-30T00:00:00.000Z",
						},
					},
				]),
			};
		}),
		update: vi.fn(() => ({
			set: updateSet,
		})),
		insert: vi.fn(() => ({
			values: insertValues,
		})),
		batch,
	})),
}));

const env = { DB: {}, RATION_KV: {} } as Env;

describe("consumeManifestEntries", () => {
	beforeEach(async () => {
		selectCall = 0;
		cookMeal.mockReset();
		getMealMissingIngredients.mockReset();
		buildCargoDeductionStatements.mockReset();
		bumpReadinessCacheVersions.mockReset();
		buildCargoDeductionStatements.mockResolvedValue([deductionStmt]);
		bumpReadinessCacheVersions.mockResolvedValue(undefined);
		isFeatureEnabled.mockReset();
		isFeatureEnabled.mockResolvedValue(false);
		updateSet.mockClear();
		updateWhere.mockClear();
		insertValues.mockClear();
		batch.mockClear();
		vi.resetModules();
	});

	it("returns requiresConfirmation when cargo is insufficient", async () => {
		getMealMissingIngredients.mockResolvedValue([
			{ name: "chicken", required: 2, available: 0, unit: "lb" },
		]);

		const { consumeManifestEntries } = await import("../manifest.server");
		const result = await consumeManifestEntries(env, orgId, planId, [entryId]);

		expect(result.requiresConfirmation).toBe(true);
		expect(result.missingIngredients).toHaveLength(1);
		expect(result.consumed).toBe(0);
		expect(cookMeal).not.toHaveBeenCalled();
		expect(batch).not.toHaveBeenCalled();
	});

	it("plans cook with skipApply then batches cargo + consumedAt", async () => {
		getMealMissingIngredients.mockResolvedValue([]);
		cookMeal.mockResolvedValue({
			deductions: [{ cargoId: "cargo-1", quantity: 1 }],
		});

		const { consumeManifestEntries } = await import("../manifest.server");
		const result = await consumeManifestEntries(env, orgId, planId, [entryId]);

		expect(result.consumed).toBe(1);
		expect(result.deductions).toHaveLength(1);
		expect(result.eventIds).toEqual(["evt-1"]);
		expect(cookMeal).toHaveBeenCalledWith(env, orgId, mealId, {
			servings: 2,
			deductionMode: "strict",
			skipApply: true,
		});
		expect(buildCargoDeductionStatements).toHaveBeenCalled();
		expect(batch).toHaveBeenCalledTimes(1);
		expect(bumpReadinessCacheVersions).toHaveBeenCalledWith(
			env.RATION_KV,
			orgId,
		);
	});

	it("calls cookMeal with partial deduction when confirmInsufficient is true", async () => {
		cookMeal.mockResolvedValue({
			deductions: [{ cargoId: "cargo-1", quantity: 100 }],
			partialCook: true,
			skippedIngredients: [
				{ name: "eggs", required: 4, available: 0, unit: "count" },
			],
		});

		const { consumeManifestEntries } = await import("../manifest.server");
		const result = await consumeManifestEntries(env, orgId, planId, [entryId], {
			confirmInsufficient: true,
		});

		expect(result.consumed).toBe(1);
		expect(result.deductions).toHaveLength(1);
		expect(result.partialCook).toBe(true);
		expect(getMealMissingIngredients).not.toHaveBeenCalled();
		expect(cookMeal).toHaveBeenCalledWith(env, orgId, mealId, {
			servings: 2,
			deductionMode: "partial",
			skipApply: true,
		});
		expect(batch).toHaveBeenCalledTimes(1);
	});

	it("logs nutrition intake when nutrition-manifest is on and portions set", async () => {
		isFeatureEnabled.mockResolvedValue(true);
		getMealMissingIngredients.mockResolvedValue([]);
		cookMeal.mockResolvedValue({
			deductions: [{ cargoId: "cargo-1", quantity: 1 }],
		});

		const { consumeManifestEntries } = await import("../manifest.server");
		const result = await consumeManifestEntries(env, orgId, planId, [entryId], {
			userId: "user-1",
			portions: [{ entryId, servings: 1.5 }],
		});

		expect(result.consumed).toBe(1);
		expect(isFeatureEnabled).toHaveBeenCalledWith(
			env,
			"nutrition-manifest",
			expect.anything(),
		);
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				entryId,
				servings: 1.5,
				energyKcal: 750,
				proteinG: 30,
				carbsG: 90,
				fatG: 15,
				userId: "user-1",
				manifestDate: "2026-07-30",
			}),
		);
	});

	it("skips intake when logNutrition is false", async () => {
		isFeatureEnabled.mockResolvedValue(true);
		getMealMissingIngredients.mockResolvedValue([]);
		cookMeal.mockResolvedValue({
			deductions: [{ cargoId: "cargo-1", quantity: 1 }],
		});

		const { consumeManifestEntries } = await import("../manifest.server");
		await consumeManifestEntries(env, orgId, planId, [entryId], {
			userId: "user-1",
			logNutrition: false,
			portions: [{ entryId, servings: 1 }],
		});

		expect(insertValues).not.toHaveBeenCalled();
	});

	it("skips intake when nutrition-manifest flag is off (legacy consume)", async () => {
		isFeatureEnabled.mockResolvedValue(false);
		getMealMissingIngredients.mockResolvedValue([]);
		cookMeal.mockResolvedValue({
			deductions: [{ cargoId: "cargo-1", quantity: 1 }],
		});

		const { consumeManifestEntries } = await import("../manifest.server");
		const result = await consumeManifestEntries(env, orgId, planId, [entryId], {
			userId: "user-1",
			portions: [{ entryId, servings: 1 }],
		});

		expect(result.consumed).toBe(1);
		expect(insertValues).not.toHaveBeenCalled();
	});

	it("skips intake on mobile when portions and logNutrition omitted (iOS 1.3.17)", async () => {
		isFeatureEnabled.mockResolvedValue(true);
		getMealMissingIngredients.mockResolvedValue([]);
		cookMeal.mockResolvedValue({
			deductions: [{ cargoId: "cargo-1", quantity: 1 }],
		});

		const { consumeManifestEntries } = await import("../manifest.server");
		const result = await consumeManifestEntries(env, orgId, planId, [entryId], {
			userId: "user-1",
			source: "mobile",
		});

		expect(result.consumed).toBe(1);
		expect(insertValues).not.toHaveBeenCalled();
	});

	it("skips intake for mcp/copilot unless logNutrition is explicitly true", async () => {
		isFeatureEnabled.mockResolvedValue(true);
		getMealMissingIngredients.mockResolvedValue([]);
		cookMeal.mockResolvedValue({
			deductions: [{ cargoId: "cargo-1", quantity: 1 }],
		});

		const { consumeManifestEntries } = await import("../manifest.server");

		selectCall = 0;
		insertValues.mockClear();
		const mcpResult = await consumeManifestEntries(
			env,
			orgId,
			planId,
			[entryId],
			{
				userId: "user-1",
				source: "mcp",
				portions: [{ entryId, servings: 1 }],
			},
		);
		expect(mcpResult.consumed).toBe(1);
		expect(insertValues).not.toHaveBeenCalled();

		selectCall = 0;
		insertValues.mockClear();
		const copilotResult = await consumeManifestEntries(
			env,
			orgId,
			planId,
			[entryId],
			{
				userId: "user-1",
				source: "copilot",
				portions: [{ entryId, servings: 1 }],
			},
		);
		expect(copilotResult.consumed).toBe(1);
		expect(insertValues).not.toHaveBeenCalled();

		selectCall = 0;
		insertValues.mockClear();
		await consumeManifestEntries(env, orgId, planId, [entryId], {
			userId: "user-1",
			source: "mcp",
			logNutrition: true,
			portions: [{ entryId, servings: 1 }],
		});
		expect(insertValues).toHaveBeenCalled();
	});

	it("logs planned meal servings when portions omitted on web", async () => {
		isFeatureEnabled.mockResolvedValue(true);
		getMealMissingIngredients.mockResolvedValue([]);
		cookMeal.mockResolvedValue({
			deductions: [{ cargoId: "cargo-1", quantity: 1 }],
		});

		const { consumeManifestEntries } = await import("../manifest.server");
		await consumeManifestEntries(env, orgId, planId, [entryId], {
			userId: "user-1",
			source: "web",
		});

		// mealServings = 2 → 500 kcal × 2
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				servings: 2,
				energyKcal: 1000,
				userId: "user-1",
			}),
		);
	});
});
