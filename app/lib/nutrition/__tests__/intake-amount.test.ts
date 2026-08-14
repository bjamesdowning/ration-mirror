import { describe, expect, it } from "vitest";
import {
	amountFromServings,
	canLogIntakeByMass,
	clampedIntakeResolve,
	clampedIntakeStep,
	clampIntakeServings,
	formatIntakeServings,
	formatLoggedIntake,
	gramsPerServingFromSnapshot,
	INTAKE_SERVINGS_MAX,
	INTAKE_SERVINGS_MIN,
	massUnitForDisplayMode,
	normalizeIntakeLoggedUnit,
	recipeMassGFromSnapshot,
	resolveIntakeAmount,
} from "../intake-amount";

describe("clampIntakeServings", () => {
	it("allows 0.1 instead of clamping up to 0.5", () => {
		expect(clampIntakeServings(0.1)).toEqual({
			servings: 0.1,
			clamped: false,
		});
	});

	it("clamps below 0.01 and above 100", () => {
		expect(clampIntakeServings(0.001)).toEqual({
			servings: INTAKE_SERVINGS_MIN,
			clamped: true,
		});
		expect(clampIntakeServings(150)).toEqual({
			servings: INTAKE_SERVINGS_MAX,
			clamped: true,
		});
		expect(clampIntakeServings(2)).toEqual({ servings: 2, clamped: false });
	});
});

describe("recipe mass helpers", () => {
	it("prefers stored recipeMassG", () => {
		expect(
			recipeMassGFromSnapshot({
				recipeMassG: 800,
				attributions: [{ grams: 10 }],
			}),
		).toBe(800);
	});

	it("falls back to attribution grams", () => {
		expect(
			recipeMassGFromSnapshot({
				attributions: [{ grams: 200 }, { grams: 50 }, { grams: null }],
			}),
		).toBe(250);
	});

	it("computes gramsPerServing from recipe yield", () => {
		expect(gramsPerServingFromSnapshot({ recipeMassG: 800 }, 4)).toBe(200);
		expect(gramsPerServingFromSnapshot({ recipeMassG: 800 }, 0)).toBeNull();
	});

	it("gates mass logging below 10 g per serving", () => {
		expect(canLogIntakeByMass(10)).toBe(true);
		expect(canLogIntakeByMass(9.9)).toBe(false);
		expect(canLogIntakeByMass(null)).toBe(false);
	});
});

describe("resolveIntakeAmount", () => {
	it("accepts 0.25 servings", () => {
		const result = resolveIntakeAmount(
			{ servings: 0.25 },
			{ gramsPerServing: 310 },
		);
		expect(result).toEqual({
			ok: true,
			servings: 0.25,
			loggedAmount: 0.25,
			loggedUnit: "serving",
		});
	});

	it("maps ⅓ chip to servings", () => {
		const result = resolveIntakeAmount(
			{ servings: 1 / 3 },
			{ gramsPerServing: null },
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.servings).toBeCloseTo(0.3333, 4);
	});

	it("rejects 0 and 0.009 servings", () => {
		expect(
			resolveIntakeAmount({ servings: 0 }, { gramsPerServing: null }).ok,
		).toBe(false);
		expect(
			resolveIntakeAmount({ servings: 0.009 }, { gramsPerServing: null }).ok,
		).toBe(false);
	});

	it("converts grams using gramsPerServing", () => {
		const result = resolveIntakeAmount(
			{ amount: 180, unit: "g" },
			{ gramsPerServing: 310 },
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.loggedUnit).toBe("g");
		expect(result.loggedAmount).toBe(180);
		expect(result.servings).toBeCloseTo(180 / 310, 4);
	});

	it("converts ounces", () => {
		const result = resolveIntakeAmount(
			{ amount: 6, unit: "oz" },
			{ gramsPerServing: 170 },
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.loggedUnit).toBe("oz");
		expect(result.servings).toBeGreaterThan(0.01);
	});

	it("returns amount_unit_unavailable without recipe mass", () => {
		const result = resolveIntakeAmount(
			{ amount: 180, unit: "g" },
			{ gramsPerServing: null },
		);
		expect(result).toMatchObject({
			ok: false,
			code: "amount_unit_unavailable",
		});
	});

	it("ignores redundant servings when they match amount+unit", () => {
		const servings = Number((180 / 310).toFixed(4));
		const result = resolveIntakeAmount(
			{ servings, amount: 180, unit: "g" },
			{ gramsPerServing: 310 },
		);
		expect(result.ok).toBe(true);
	});

	it("rejects servings that disagree with amount+unit", () => {
		const result = resolveIntakeAmount(
			{ servings: 1, amount: 180, unit: "g" },
			{ gramsPerServing: 310 },
		);
		expect(result).toMatchObject({
			ok: false,
			code: "amount_servings_mismatch",
		});
	});

	it("treats unit servings as an alias of serving", () => {
		expect(normalizeIntakeLoggedUnit("servings")).toBe("serving");
		const result = resolveIntakeAmount(
			{ amount: 1.5, unit: "servings" },
			{ gramsPerServing: null },
		);
		expect(result).toEqual({
			ok: true,
			servings: 1.5,
			loggedAmount: 1.5,
			loggedUnit: "serving",
		});
	});

	it("requires servings or amount+unit", () => {
		expect(resolveIntakeAmount({}, { gramsPerServing: null })).toMatchObject({
			ok: false,
			code: "missing_amount",
		});
	});
});

describe("display helpers", () => {
	it("formats fraction chips and logged units", () => {
		expect(formatIntakeServings(0.5)).toBe("½");
		expect(formatIntakeServings(1 / 3)).toBe("⅓");
		expect(formatLoggedIntake(0.5, "serving")).toBe("½ serving");
		expect(formatLoggedIntake(1, "serving")).toBe("1 serving");
		expect(formatLoggedIntake(180, "g")).toBe("180 g");
	});

	it("picks mass unit from display mode", () => {
		expect(massUnitForDisplayMode("imperial")).toBe("oz");
		expect(massUnitForDisplayMode("metric")).toBe("g");
		expect(massUnitForDisplayMode("cooking")).toBe("g");
	});

	it("converts servings back to grams", () => {
		expect(amountFromServings(0.5, "g", 310)).toBe(155);
		expect(amountFromServings(1, "serving", 310)).toBe(1);
	});
});

describe("clampedIntakeResolve / clampedIntakeStep", () => {
	it("keeps a valid serving amount", () => {
		expect(clampedIntakeResolve(1.5, "serving", null)).toEqual({
			servings: 1.5,
			amount: 1.5,
			unit: "serving",
		});
	});

	it("clamps below minimum and above maximum", () => {
		expect(clampedIntakeResolve(0, "serving", null)).toEqual({
			servings: INTAKE_SERVINGS_MIN,
			amount: INTAKE_SERVINGS_MIN,
			unit: "serving",
		});
		expect(clampedIntakeResolve(150, "serving", null)).toEqual({
			servings: INTAKE_SERVINGS_MAX,
			amount: INTAKE_SERVINGS_MAX,
			unit: "serving",
		});
	});

	it("steps a quarter serving up", () => {
		expect(clampedIntakeStep(1, "serving", 1, null)).toEqual({
			servings: 1.25,
			amount: 1.25,
			unit: "serving",
		});
	});

	it("does not drop below the minimum when stepping down", () => {
		expect(clampedIntakeStep(0.25, "serving", -1, null).servings).toBe(
			INTAKE_SERVINGS_MIN,
		);
	});

	it("does not exceed the maximum when stepping up", () => {
		expect(clampedIntakeStep(100, "serving", 1, null).servings).toBe(
			INTAKE_SERVINGS_MAX,
		);
	});

	it("steps grams and converts back to servings", () => {
		const result = clampedIntakeStep(180, "g", 1, 310);
		expect(result.unit).toBe("g");
		expect(result.amount).toBe(190);
		expect(result.servings).toBeCloseTo(190 / 310, 4);
	});

	it("scales macros with the stepped quantity", () => {
		const stepped = clampedIntakeStep(1, "serving", 1, null);
		expect(500 * stepped.servings).toBe(625);
		expect(20 * stepped.servings).toBe(25);
	});
});
