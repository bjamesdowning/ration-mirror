import { describe, expect, it } from "vitest";
import {
	detectNutritionSchemaVersion,
	fromCanonicalNutrientAmounts,
	isNutritionSnapshotV2,
	matchQualityFromLegacy,
	normalizeNutritionSnapshot,
	projectNutritionSnapshotToLegacy,
	toCanonicalNutrientAmounts,
	upgradeNutritionSnapshotToV2,
} from "../adapters";
import type { NutritionSnapshot } from "../types";

const USDA_V1: NutritionSnapshot = {
	source: "usda",
	confidence: 1,
	verified: true,
	per100g: {
		energyKcal: 42,
		proteinG: 3.4,
		fatG: 1,
		carbG: 5,
		fiberG: 0,
		sugarG: 5,
		satFatG: 0.6,
		sodiumMg: 44,
		saltG: 0.1,
	},
	perServing: null,
	fdcId: 1097510,
	description: "Milk, whole",
};

describe("adapters", () => {
	it("detects v1 vs v2 schemaVersion", () => {
		expect(detectNutritionSchemaVersion(USDA_V1)).toBe(1);
		const v2 = upgradeNutritionSnapshotToV2(USDA_V1);
		expect(detectNutritionSchemaVersion(v2)).toBe(2);
		expect(isNutritionSnapshotV2(v2)).toBe(true);
	});

	it("upgrades v1 to v2 with nullable nutrients and metadata", () => {
		const v2 = upgradeNutritionSnapshotToV2(USDA_V1);
		expect(v2.schemaVersion).toBe(2);
		expect(v2.sourceRef).toBe("fdc:1097510");
		expect(v2.matchQuality).toBe("verified");
		expect(v2.servingBasis).toBe("per100g");
		expect(v2.nutrientCoverage).toBeGreaterThan(0);
		expect(v2.per100g?.energyKcal).toBe(42);
	});

	it("projects v2 back to legacy v1 (null core → 0)", () => {
		const v2 = normalizeNutritionSnapshot({
			...upgradeNutritionSnapshotToV2(USDA_V1),
			per100g: {
				energyKcal: null,
				proteinG: 10,
				fatG: null,
				carbG: 5,
				fiberG: null,
				sugarG: null,
				satFatG: null,
				sodiumMg: null,
				saltG: null,
			},
		});
		const legacy = projectNutritionSnapshotToLegacy(v2);
		expect(legacy.per100g?.energyKcal).toBe(0);
		expect(legacy.per100g?.proteinG).toBe(10);
		expect(legacy.per100g?.fatG).toBe(0);
	});

	it("maps legacy confidence to matchQuality tiers", () => {
		expect(matchQualityFromLegacy("usda", 1, true)).toBe("verified");
		expect(matchQualityFromLegacy("ai_estimate", 0.7, false)).toBe("medium");
		expect(matchQualityFromLegacy("user_override", 0, false)).toBe("unknown");
	});

	it("maps carbG ↔ carbsG without coercing null to zero", () => {
		const canonical = toCanonicalNutrientAmounts({
			energyKcal: 10,
			proteinG: null,
			fatG: 1,
			carbG: 2,
			fiberG: null,
			sugarG: null,
			satFatG: null,
			sodiumMg: null,
			saltG: null,
		});
		expect(canonical).toEqual({
			energyKcal: 10,
			proteinG: null,
			carbsG: 2,
			fatG: 1,
			fiberG: null,
			sugarG: null,
			satFatG: null,
			sodiumMg: null,
			saltG: null,
		});
		expect(fromCanonicalNutrientAmounts(canonical)).toEqual({
			energyKcal: 10,
			proteinG: null,
			carbG: 2,
			fatG: 1,
			fiberG: null,
			sugarG: null,
			satFatG: null,
			sodiumMg: null,
			saltG: null,
		});
	});
});
