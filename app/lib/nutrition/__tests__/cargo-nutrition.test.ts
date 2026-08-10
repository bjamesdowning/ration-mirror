import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NutritionSnapshot, ResolvedFood } from "../types";

vi.mock("../resolve-food.server", () => ({
	resolveFoodName: vi.fn(),
}));

vi.mock("../ai-estimate.server", () => ({
	estimateNutritionWithAi: vi.fn(),
}));

vi.mock("../fdc-portion.server", () => ({
	resolveHouseholdServingGrams: vi.fn().mockResolvedValue({
		grams: null,
		portion: null,
	}),
}));

import { estimateNutritionWithAi } from "../ai-estimate.server";
import {
	resolveAndBuildCargoNutrition,
	resolveAndBuildCargoNutritionV2,
} from "../cargo-nutrition.server";
import { resolveFoodName } from "../resolve-food.server";

const env = {} as Env;

function emptyUsdaHit(
	nutrients: ResolvedFood["nutrientsPer100g"],
): ResolvedFood {
	return {
		fdcId: 99999,
		description: "Test food",
		nutrientsPer100g: nutrients,
		autoAccept: true,
		matchQuality: "high",
	};
}

const aiSnap: NutritionSnapshot = {
	source: "ai_estimate",
	confidence: 0.7,
	verified: false,
	per100g: {
		energyKcal: 165,
		proteinG: 31,
		fatG: 3.6,
		carbG: 0,
		fiberG: null,
		sugarG: null,
		satFatG: null,
		sodiumMg: null,
		saltG: null,
	},
	perServing: null,
	fdcId: null,
	description: "AI roast chicken",
};

describe("resolveAndBuildCargoNutrition profile gate", () => {
	beforeEach(() => {
		vi.mocked(resolveFoodName).mockReset();
		vi.mocked(estimateNutritionWithAi).mockReset();
	});

	it("falls through to AI when USDA energy is empty and allowAiEstimate", async () => {
		vi.mocked(resolveFoodName).mockResolvedValue(
			emptyUsdaHit({
				energyKcal: 0,
				proteinG: 0,
				fatG: 0,
				carbG: 0,
				fiberG: null,
				sugarG: null,
				satFatG: null,
				sodiumMg: null,
				saltG: null,
			}),
		);
		vi.mocked(estimateNutritionWithAi).mockResolvedValue(aiSnap);

		const snap = await resolveAndBuildCargoNutrition(env, "Roast Chicken", {
			allowAiEstimate: true,
		});

		expect(snap?.source).toBe("ai_estimate");
		expect(snap?.per100g?.energyKcal).toBe(165);
		expect(estimateNutritionWithAi).toHaveBeenCalledOnce();
	});

	it("returns null when USDA energy is empty and AI is not allowed", async () => {
		vi.mocked(resolveFoodName).mockResolvedValue(
			emptyUsdaHit({
				energyKcal: null,
				proteinG: 20,
				fatG: 10,
				carbG: 0,
				fiberG: null,
				sugarG: null,
				satFatG: null,
				sodiumMg: null,
				saltG: null,
			}),
		);

		const snap = await resolveAndBuildCargoNutrition(env, "Mozzarella", {
			allowAiEstimate: false,
		});

		expect(snap).toBeNull();
		expect(estimateNutritionWithAi).not.toHaveBeenCalled();
	});

	it("accepts a usable USDA profile without calling AI", async () => {
		vi.mocked(resolveFoodName).mockResolvedValue(
			emptyUsdaHit({
				energyKcal: 280,
				proteinG: 22,
				fatG: 22,
				carbG: 2,
				fiberG: null,
				sugarG: null,
				satFatG: null,
				sodiumMg: null,
				saltG: null,
			}),
		);

		const snap = await resolveAndBuildCargoNutrition(env, "Mozzarella", {
			allowAiEstimate: true,
		});

		expect(snap?.source).toBe("usda");
		expect(snap?.per100g?.energyKcal).toBe(280);
		expect(estimateNutritionWithAi).not.toHaveBeenCalled();
	});

	it("V2 falls through to AI for Atwater-inconsistent USDA zeros", async () => {
		vi.mocked(resolveFoodName).mockResolvedValue(
			emptyUsdaHit({
				energyKcal: 0,
				proteinG: 25,
				fatG: 10,
				carbG: 0,
				fiberG: null,
				sugarG: null,
				satFatG: null,
				sodiumMg: null,
				saltG: null,
			}),
		);
		vi.mocked(estimateNutritionWithAi).mockResolvedValue(aiSnap);

		const snap = await resolveAndBuildCargoNutritionV2(env, "Chicken", {
			allowAiEstimate: true,
		});

		expect(snap?.source).toBe("ai_estimate");
		expect(estimateNutritionWithAi).toHaveBeenCalledOnce();
	});
});
