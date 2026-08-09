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
});
