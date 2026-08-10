import { describe, expect, it } from "vitest";
import {
	buildAiEstimateSnapshot,
	macroEnergyConsistency,
	parseAiNutritionJson,
} from "../ai-estimate.server";

describe("parseAiNutritionJson", () => {
	it("parses bare JSON", () => {
		const raw = parseAiNutritionJson(
			'{"energyKcal":52,"proteinG":0.3,"fatG":0.2,"carbG":14}',
		);
		expect(raw).toEqual({
			energyKcal: 52,
			proteinG: 0.3,
			fatG: 0.2,
			carbG: 14,
		});
	});

	it("strips markdown fences", () => {
		const raw = parseAiNutritionJson(
			'```json\n{"energyKcal":100,"proteinG":5,"fatG":2,"carbG":15}\n```',
		);
		expect(raw).toMatchObject({ energyKcal: 100 });
	});

	it("returns null on invalid JSON", () => {
		expect(parseAiNutritionJson("not json")).toBeNull();
	});
});

describe("macroEnergyConsistency", () => {
	it("is near 1 when Atwater matches", () => {
		const score = macroEnergyConsistency({
			energyKcal: 400,
			proteinG: 25,
			fatG: 20,
			carbG: 30,
		});
		// 25*4 + 30*4 + 20*9 = 100+120+180 = 400
		expect(score).toBeCloseTo(1, 5);
	});

	it("drops when energy diverges", () => {
		const score = macroEnergyConsistency({
			energyKcal: 800,
			proteinG: 25,
			fatG: 20,
			carbG: 30,
		});
		expect(score).toBeLessThan(0.6);
	});
});

describe("buildAiEstimateSnapshot", () => {
	it("marks ai_estimate unverified and clamps confidence", () => {
		const snap = buildAiEstimateSnapshot({
			energyKcal: 400,
			proteinG: 25,
			fatG: 20,
			carbG: 30,
			confidence: 0.9,
			description: "Example food",
		});
		expect(snap.source).toBe("ai_estimate");
		expect(snap.verified).toBe(false);
		expect(snap.fdcId).toBeNull();
		expect(snap.description).toBe("Example food");
		expect(snap.confidence).toBeLessThanOrEqual(0.9);
		expect(snap.per100g?.energyKcal).toBe(400);
	});

	it("scales package totals for milk liters using density when name is known", () => {
		const snap = buildAiEstimateSnapshot(
			{
				energyKcal: 61,
				proteinG: 3.2,
				fatG: 3.3,
				carbG: 4.8,
				confidence: 0.8,
				description: "Milk, whole",
			},
			{ quantity: 2, unit: "l", ingredientName: "whole milk" },
		);
		expect(snap.per100g?.energyKcal).toBe(61);
		// ~2 L × ~1.03 g/ml → ~2060 g → ~20.6 × 61 ≈ 1250 kcal package
		expect(snap.perServing?.energyKcal).toBeGreaterThan(1100);
		expect(snap.perServing?.energyKcal).toBeLessThan(1400);
	});

	it("leaves perServing null for liters without ingredient density name", () => {
		const snap = buildAiEstimateSnapshot(
			{
				energyKcal: 61,
				proteinG: 3.2,
				fatG: 3.3,
				carbG: 4.8,
			},
			{ quantity: 2, unit: "l" },
		);
		expect(snap.perServing).toBeNull();
	});
});
