import { beforeEach, describe, expect, it, vi } from "vitest";

const cookMeal = vi.fn();
const getMealMissingIngredients = vi.fn();

vi.mock("../meals.server", () => ({
	cookMeal: (...args: unknown[]) => cookMeal(...args),
}));

vi.mock("../matching.server", () => ({
	getMealMissingIngredients: (...args: unknown[]) =>
		getMealMissingIngredients(...args),
}));

const planId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const entryId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const mealId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const orgId = "org-1";

let selectCall = 0;

const updateWhere = vi.fn().mockResolvedValue(undefined);
const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
const batch = vi.fn().mockResolvedValue(undefined);

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
						servingsOverride: null,
						mealServings: 2,
					},
				]),
			};
		}),
		update: vi.fn(() => ({
			set: updateSet,
		})),
		batch,
	})),
}));

const env = { DB: {} } as Env;

describe("consumeManifestEntries", () => {
	beforeEach(async () => {
		selectCall = 0;
		cookMeal.mockReset();
		getMealMissingIngredients.mockReset();
		updateSet.mockClear();
		updateWhere.mockClear();
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
		expect(cookMeal).toHaveBeenCalledWith(env, orgId, mealId, {
			servings: 2,
			deductionMode: "strict",
			skipApply: true,
		});
		expect(batch).toHaveBeenCalledTimes(1);
		expect(updateSet).toHaveBeenCalled();
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
});
