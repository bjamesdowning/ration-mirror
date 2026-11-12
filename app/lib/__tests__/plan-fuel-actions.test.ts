import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";
import type { NutritionPrincipal } from "~/lib/nutrition/service.server";
import type { NutrientValues, NutritionSnapshot } from "~/lib/nutrition/types";
import { createMockEnv } from "~/test/helpers/mock-env";
import { addCargoToFuel, addMealToFuel } from "../plan-fuel-actions.server";

const limit = vi.hoisted(() => vi.fn());
const batch = vi.hoisted(() => vi.fn());
const updateWhere = vi.hoisted(() => vi.fn());
const logDiaryFood = vi.hoisted(() => vi.fn());
const cookMeal = vi.hoisted(() => vi.fn());
const getMealMissingIngredients = vi.hoisted(() => vi.fn());
const buildCargoDeductionStatements = vi.hoisted(() => vi.fn());
const applyCargoDeductions = vi.hoisted(() => vi.fn());
const applyUndoRecord = vi.hoisted(() => vi.fn());

vi.mock("drizzle-orm/d1", () => ({
	drizzle: () => ({
		select: () => ({
			from: () => ({
				where: () => ({
					limit,
				}),
			}),
		}),
		batch,
		update: () => ({
			set: () => ({
				where: updateWhere,
			}),
		}),
	}),
}));

vi.mock("~/lib/nutrition/diary.server", () => ({
	logDiaryFood: (...args: unknown[]) => logDiaryFood(...args),
}));

vi.mock("~/lib/meals.server", () => ({
	cookMeal: (...args: unknown[]) => cookMeal(...args),
}));

vi.mock("~/lib/matching.server", () => ({
	getMealMissingIngredients: (...args: unknown[]) =>
		getMealMissingIngredients(...args),
}));

vi.mock("~/lib/cargo-deduction.server", () => ({
	buildCargoDeductionStatements: (...args: unknown[]) =>
		buildCargoDeductionStatements(...args),
	applyCargoDeductions: (...args: unknown[]) => applyCargoDeductions(...args),
}));

vi.mock("~/lib/cook-reversal.server", () => ({
	applyUndoRecord: (...args: unknown[]) => applyUndoRecord(...args),
}));

const orgId = "org-1";
const cargoId = "cargo-1";
const mealId = "meal-1";
const env = createMockEnv();
const principal = {
	userId: "user-1",
	organizationId: orgId,
} as NutritionPrincipal;
const flags = {} as FlagshipEvaluationContext;
const write = {
	operationKey: "11111111-1111-4111-8111-111111111111",
	idempotencyKey: "22222222-2222-4222-8222-222222222222",
	fuelTimeZone: "America/New_York",
	occurredAt: "2026-11-12T15:00:00.000Z",
};

function nutrients(overrides: Partial<NutrientValues>): NutrientValues {
	return {
		energyKcal: 0,
		proteinG: 0,
		fatG: 0,
		carbG: 0,
		fiberG: null,
		sugarG: null,
		satFatG: null,
		sodiumMg: null,
		saltG: null,
		...overrides,
	};
}

const carrotPer100g = nutrients({
	energyKcal: 41,
	proteinG: 0.93,
	fatG: 0.24,
	carbG: 9.58,
	fiberG: 2.8,
	sugarG: 4.7,
	sodiumMg: 69,
});

const carrotSnapshot: NutritionSnapshot = {
	source: "usda",
	confidence: 1,
	verified: true,
	per100g: carrotPer100g,
	perServing: null,
	fdcId: 170393,
	description: "Carrots, raw",
};

const cupPerServing = nutrients({
	energyKcal: 105,
	proteinG: 1.3,
	fatG: 0.4,
	carbG: 27,
	fiberG: 3,
	sugarG: 12,
	sodiumMg: 80,
});

const cupSnapshot: NutritionSnapshot = {
	...carrotSnapshot,
	perServing: cupPerServing,
};

function cargoRow(
	nutrition: NutritionSnapshot | null,
	unit = "g",
	quantity = 500,
) {
	return {
		id: cargoId,
		organizationId: orgId,
		name: "Carrots",
		quantity,
		unit,
		nutrition,
	};
}

function loggedMacros() {
	return logDiaryFood.mock.calls[0]?.[3]?.macros;
}

describe("addCargoToFuel", () => {
	beforeEach(() => {
		limit.mockReset();
		batch.mockReset();
		updateWhere.mockReset();
		logDiaryFood.mockReset();
		cookMeal.mockReset();
		getMealMissingIngredients.mockReset();
		buildCargoDeductionStatements.mockReset();
		applyCargoDeductions.mockReset();
		applyUndoRecord.mockReset();
		batch.mockResolvedValue(undefined);
		updateWhere.mockResolvedValue(undefined);
		logDiaryFood.mockResolvedValue({ intakeId: "intake-1" });
		buildCargoDeductionStatements.mockResolvedValue([{ stmt: true }]);
		applyCargoDeductions.mockResolvedValue(undefined);
		applyUndoRecord.mockResolvedValue(undefined);
		getMealMissingIngredients.mockResolvedValue([]);
	});

	it("logs 100 g of a per-100 g carrot snapshot, including carbs from carbG", async () => {
		limit.mockResolvedValue([cargoRow(carrotSnapshot)]);

		const result = await addCargoToFuel(
			env,
			orgId,
			cargoId,
			100,
			principal,
			flags,
			write,
		);

		expect(result).toEqual({ intakeId: "intake-1", deducted: 100 });
		expect(loggedMacros()).toEqual({
			energyKcal: 41,
			proteinG: 0.93,
			carbsG: 9.58,
			fatG: 0.24,
		});
		expect(buildCargoDeductionStatements).toHaveBeenCalledTimes(1);
		expect(batch).toHaveBeenCalledTimes(1);
		expect(logDiaryFood).toHaveBeenCalledTimes(1);
		expect(applyCargoDeductions).not.toHaveBeenCalled();
		expect(batch.mock.invocationCallOrder[0]).toBeLessThan(
			logDiaryFood.mock.invocationCallOrder[0],
		);
	});

	it("does not log 100 cups when 100 g has a one-cup perServing", async () => {
		limit.mockResolvedValue([cargoRow(cupSnapshot)]);

		await addCargoToFuel(env, orgId, cargoId, 100, principal, flags, write);

		expect(loggedMacros()).toEqual({
			energyKcal: 41,
			proteinG: 0.93,
			carbsG: 9.58,
			fatG: 0.24,
		});
		expect(loggedMacros().energyKcal).not.toBe(105 * 100);
		expect(loggedMacros().carbsG).not.toBe(27 * 100);
	});

	it("converts ounces with 28.3495 before scaling per 100 g", async () => {
		limit.mockResolvedValue([cargoRow(carrotSnapshot, "oz", 16)]);

		await addCargoToFuel(env, orgId, cargoId, 4, principal, flags, write);

		const grams = 4 * 28.3495;
		const macros = loggedMacros();
		expect(macros.energyKcal).toBeCloseTo((41 * grams) / 100, 5);
		expect(macros.proteinG).toBeCloseTo((0.93 * grams) / 100, 5);
		expect(macros.carbsG).toBeCloseTo((9.58 * grams) / 100, 5);
		expect(macros.fatG).toBeCloseTo((0.24 * grams) / 100, 5);
	});

	it("logs zeros for a null snapshot and still deducts after the stock move", async () => {
		limit.mockResolvedValue([cargoRow(null)]);

		const result = await addCargoToFuel(
			env,
			orgId,
			cargoId,
			100,
			principal,
			flags,
			write,
		);

		expect(result).toEqual({ intakeId: "intake-1", deducted: 100 });
		expect(loggedMacros()).toEqual({
			energyKcal: 0,
			proteinG: 0,
			carbsG: 0,
			fatG: 0,
		});
		expect(batch).toHaveBeenCalledTimes(1);
		expect(logDiaryFood).toHaveBeenCalledTimes(1);
	});

	it("does not log or deduct when the stock move does not succeed", async () => {
		limit.mockResolvedValue([cargoRow(carrotSnapshot)]);
		buildCargoDeductionStatements.mockResolvedValue([]);

		await expect(
			addCargoToFuel(env, orgId, cargoId, 100, principal, flags, write),
		).rejects.toMatchObject({
			data: { error: "That amount is not in Cargo" },
			init: { status: 409 },
		});
		expect(batch).not.toHaveBeenCalled();
		expect(logDiaryFood).not.toHaveBeenCalled();
		expect(applyCargoDeductions).not.toHaveBeenCalled();
	});

	it("does not log when the stock write throws", async () => {
		limit.mockResolvedValue([cargoRow(carrotSnapshot)]);
		batch.mockRejectedValue(new Error("d1 down"));

		await expect(
			addCargoToFuel(env, orgId, cargoId, 100, principal, flags, write),
		).rejects.toThrow("d1 down");
		expect(logDiaryFood).not.toHaveBeenCalled();
		expect(applyCargoDeductions).not.toHaveBeenCalled();
	});

	it("restores cargo when the diary write throws", async () => {
		limit
			.mockResolvedValueOnce([cargoRow(carrotSnapshot, "g", 250)])
			.mockResolvedValueOnce([{ quantity: 150 }]);
		logDiaryFood.mockRejectedValue(new Error("diary down"));

		await expect(
			addCargoToFuel(env, orgId, cargoId, 100, principal, flags, write),
		).rejects.toThrow("diary down");
		expect(buildCargoDeductionStatements).toHaveBeenCalledTimes(1);
		expect(batch).toHaveBeenCalledTimes(1);
		expect(logDiaryFood).toHaveBeenCalledTimes(1);
		expect(applyCargoDeductions).toHaveBeenCalledWith(
			env.DB,
			orgId,
			[{ cargoId, quantity: 100 }],
			{ sign: 1 },
		);
		expect(logDiaryFood.mock.invocationCallOrder[0]).toBeLessThan(
			applyCargoDeductions.mock.invocationCallOrder[0],
		);
	});
});

describe("addMealToFuel", () => {
	const mealPerServing = nutrients({
		energyKcal: 400,
		proteinG: 30,
		fatG: 12,
		carbG: 20,
		fiberG: 4,
	});

	beforeEach(() => {
		limit.mockReset();
		batch.mockReset();
		updateWhere.mockReset();
		logDiaryFood.mockReset();
		cookMeal.mockReset();
		getMealMissingIngredients.mockReset();
		buildCargoDeductionStatements.mockReset();
		applyCargoDeductions.mockReset();
		applyUndoRecord.mockReset();
		batch.mockResolvedValue(undefined);
		updateWhere.mockResolvedValue(undefined);
		logDiaryFood.mockResolvedValue({ intakeId: "intake-1" });
		buildCargoDeductionStatements.mockResolvedValue([{ stmt: true }]);
		applyCargoDeductions.mockResolvedValue(undefined);
		applyUndoRecord.mockResolvedValue(undefined);
		getMealMissingIngredients.mockResolvedValue([]);
		cookMeal.mockResolvedValue({
			cooked: true,
			ingredientsDeducted: 1,
			servings: 1,
			deductions: [{ cargoId, quantity: 2 }],
			partialCook: false,
			eventIds: ["event-1"],
		});
		limit.mockResolvedValue([
			{
				id: mealId,
				name: "Stew",
				servings: 4,
				nutrition: {
					perServing: mealPerServing,
					coverage: 1,
					attributions: [],
					computedAt: "2026-11-12T00:00:00.000Z",
				},
			},
		]);
	});

	it("logs one serving of a four-serving meal, not a quarter", async () => {
		const result = await addMealToFuel(
			env,
			orgId,
			mealId,
			1,
			false,
			principal,
			flags,
			write,
		);

		expect(result).toEqual({
			requiresConfirmation: false,
			intakeId: "intake-1",
			mealId,
		});
		expect(loggedMacros()).toEqual({
			energyKcal: 400,
			proteinG: 30,
			carbsG: 20,
			fatG: 12,
			fiberG: 4,
		});
		expect(cookMeal).toHaveBeenCalledTimes(1);
		expect(cookMeal).toHaveBeenCalledWith(env, orgId, mealId, {
			servings: 1,
			deductionMode: "strict",
			userId: principal.userId,
			source: "mobile",
		});
		expect(logDiaryFood).toHaveBeenCalledTimes(1);
		expect(logDiaryFood.mock.calls[0]?.[3]).toMatchObject({
			amount: 1,
			unit: "serving",
			compositionSource: "meal",
		});
		expect(buildCargoDeductionStatements).not.toHaveBeenCalled();
		expect(applyUndoRecord).not.toHaveBeenCalled();
		expect(cookMeal.mock.invocationCallOrder[0]).toBeLessThan(
			logDiaryFood.mock.invocationCallOrder[0],
		);
	});

	it("restores the Galley cook when the diary write throws", async () => {
		logDiaryFood.mockRejectedValue(new Error("diary down"));

		await expect(
			addMealToFuel(env, orgId, mealId, 1, false, principal, flags, write),
		).rejects.toThrow("diary down");
		expect(cookMeal).toHaveBeenCalledTimes(1);
		expect(logDiaryFood).toHaveBeenCalledTimes(1);
		expect(applyUndoRecord).toHaveBeenCalledWith(
			env.DB,
			orgId,
			{
				kind: "cook",
				userId: principal.userId,
				deductions: [{ cargoId, quantity: 2 }],
				eventIds: ["event-1"],
			},
			{ kv: env.RATION_KV },
		);
		expect(updateWhere).not.toHaveBeenCalled();
		expect(logDiaryFood.mock.invocationCallOrder[0]).toBeLessThan(
			applyUndoRecord.mock.invocationCallOrder[0],
		);
	});
});
