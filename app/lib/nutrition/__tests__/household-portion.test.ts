import { describe, expect, it } from "vitest";
import {
	resolveHouseholdPortion,
	unitsFromStoredGramWeights,
} from "../household-portion";

const per100g = {
	energyKcal: 100,
	proteinG: 10,
	carbsG: 12,
	fatG: 4,
	fiberG: 1,
};

describe("household portions", () => {
	it("scales 1 cup from a stored gram weight per 100 g", () => {
		const scaled = resolveHouseholdPortion({
			amount: 1,
			unit: "cup",
			per100g,
			portions: [{ unit: "cup", gramWeight: 240, amount: 1 }],
		});
		expect(scaled.ok).toBe(true);
		if (!scaled.ok) return;
		expect(scaled.kind).toBe("scaled");
		expect(scaled.grams).toBe(240);
		expect(scaled.macros.energyKcal).toBe(240);
		expect(scaled.macros.proteinG).toBe(24);
		expect(scaled.macros.carbsG).toBeCloseTo(28.8);
		expect(scaled.macros.fatG).toBeCloseTo(9.6);
		expect(scaled.macros.fiberG).toBeCloseTo(2.4);
	});

	it("rejects 1 cup when the stored measure has no gram weight", () => {
		const rejected = resolveHouseholdPortion({
			amount: 1,
			unit: "cup",
			per100g,
			portions: [
				{ unit: "cup", gramWeight: null },
				{ unit: "slice", gramWeight: 30, amount: 1 },
			],
		});
		expect(rejected).toMatchObject({
			ok: false,
			code: "amount_unit_unavailable",
			allowedUnits: ["g", "oz", "slice"],
		});
		if (rejected.ok) return;
		expect(rejected.message).toContain("slice");
		expect(rejected.allowedUnits).not.toContain("cup");
	});

	it("lists only units that have a stored gram weight", () => {
		expect(
			unitsFromStoredGramWeights([
				{ unit: "cup", gramWeight: 0 },
				{ unit: "tbsp", gramWeight: null },
				{ unit: "slice", gramWeight: 28 },
				{ unit: "slice", gramWeight: 28 },
			]),
		).toEqual(["g", "oz", "slice"]);
	});

	it("uses the stored amount as the gram-weight basis", () => {
		const scaled = resolveHouseholdPortion({
			amount: 1,
			unit: "cup",
			per100g,
			portions: [{ unit: "cup", gramWeight: 240, amount: 2 }],
		});
		expect(scaled.ok).toBe(true);
		if (!scaled.ok) return;
		expect(scaled.grams).toBe(120);
		expect(scaled.macros.energyKcal).toBe(120);
	});

	it("does not turn a stored 50 g cup into a standard cup", () => {
		const scaled = resolveHouseholdPortion({
			amount: 1,
			unit: "cup",
			per100g,
			portions: [{ unit: "cup", gramWeight: 50 }],
		});
		expect(scaled.ok).toBe(true);
		if (!scaled.ok) return;
		expect(scaled.grams).toBe(50);
		expect(scaled.macros.energyKcal).toBe(50);
	});

	it("does not turn a handful into grams", () => {
		const rejected = resolveHouseholdPortion({
			amount: 1,
			unit: "handful",
			per100g,
			portions: [{ unit: "cup", gramWeight: 240, amount: 1 }],
		});
		expect(rejected.ok).toBe(false);
		if (rejected.ok) return;
		expect(rejected.code).toBe("amount_unit_unavailable");
		expect(rejected.allowedUnits).toEqual(["g", "oz", "cup"]);
	});

	it("scales a gram amount from per 100 g without a food-specific weight", () => {
		const scaled = resolveHouseholdPortion({
			amount: 50,
			unit: "g",
			per100g,
			portions: [],
		});
		expect(scaled.ok).toBe(true);
		if (!scaled.ok) return;
		expect(scaled.grams).toBe(50);
		expect(scaled.macros.energyKcal).toBe(50);
	});

	it("leaves typed macros unconverted", () => {
		const typed = {
			energyKcal: 80,
			proteinG: 5,
			carbsG: 6,
			fatG: 3,
			fiberG: null,
		};
		const result = resolveHouseholdPortion({
			amount: 1,
			unit: "cup",
			macros: typed,
			per100g,
			portions: [{ unit: "cup", gramWeight: 240 }],
		});
		expect(result).toEqual({
			ok: true,
			kind: "typed",
			macros: typed,
			grams: null,
		});
	});
});
