import { describe, expect, it } from "vitest";
import {
	applyUserOverrideToSnapshot,
	formatCoveragePercent,
	getDisplayNutrients,
	isMealNutritionSnapshot,
	kcalToKj,
	provenanceLabel,
} from "../panel-helpers";
import type { MealNutritionSnapshot, NutritionSnapshot } from "../types";

const cargoSnap: NutritionSnapshot = {
	source: "usda",
	confidence: 1,
	verified: true,
	per100g: {
		energyKcal: 52,
		proteinG: 0.3,
		fatG: 0.2,
		carbG: 14,
		fiberG: 2.4,
		sugarG: 10,
		satFatG: 0,
		sodiumMg: 1,
		saltG: 0,
	},
	perServing: {
		energyKcal: 95,
		proteinG: 0.5,
		fatG: 0.3,
		carbG: 25,
		fiberG: 4,
		sugarG: 19,
		satFatG: 0,
		sodiumMg: 2,
		saltG: 0,
	},
	fdcId: 9003,
	description: "Apples, raw",
};

const mealSnap: MealNutritionSnapshot = {
	perServing: {
		energyKcal: 95,
		proteinG: 0.5,
		fatG: 0.3,
		carbG: 25,
		fiberG: 4,
		sugarG: 19,
		satFatG: 0,
		sodiumMg: 2,
		saltG: 0,
	},
	coverage: 0.85,
	attributions: [],
	computedAt: "2026-08-09T00:00:00.000Z",
};

describe("kcalToKj", () => {
	it("multiplies by 4.184", () => {
		expect(kcalToKj(100)).toBeCloseTo(418.4);
	});
});

describe("provenanceLabel", () => {
	it("maps sources and blank", () => {
		expect(provenanceLabel("usda", true)).toBe("USDA");
		expect(provenanceLabel("ai_estimate", true)).toBe("Estimated");
		expect(provenanceLabel("user_override", true)).toBe("Override");
		expect(provenanceLabel("usda", false)).toBe("Blank");
		expect(provenanceLabel(null, true)).toBe("Blank");
	});
});

describe("formatCoveragePercent", () => {
	it("rounds and clamps", () => {
		expect(formatCoveragePercent(0.854)).toBe("85%");
		expect(formatCoveragePercent(1.2)).toBe("100%");
		expect(formatCoveragePercent(-0.1)).toBe("0%");
	});
});

describe("getDisplayNutrients", () => {
	it("uses meal perServing", () => {
		expect(getDisplayNutrients(mealSnap, "meal")?.energyKcal).toBe(95);
	});

	it("prefers cargo perServing then per100g", () => {
		expect(getDisplayNutrients(cargoSnap, "cargo")?.energyKcal).toBe(95);
		const per100Only: NutritionSnapshot = {
			...cargoSnap,
			perServing: null,
		};
		expect(getDisplayNutrients(per100Only, "cargo")?.energyKcal).toBe(52);
	});
});

describe("isMealNutritionSnapshot", () => {
	it("discriminates meal vs cargo shapes", () => {
		expect(isMealNutritionSnapshot(mealSnap)).toBe(true);
		expect(isMealNutritionSnapshot(cargoSnap)).toBe(false);
	});
});

describe("applyUserOverrideToSnapshot", () => {
	it("sets user_override and verified", () => {
		const next = applyUserOverrideToSnapshot(cargoSnap, {
			energyKcal: 120,
			proteinG: 1,
		});
		expect(next.source).toBe("user_override");
		expect(next.verified).toBe(true);
		expect(next.perServing?.energyKcal).toBe(120);
		expect(next.perServing?.proteinG).toBe(1);
		expect(next.perServing?.fatG).toBe(0.3);
		expect(next.fdcId).toBe(9003);
		expect(next.per100g).toBeNull();
	});
});
