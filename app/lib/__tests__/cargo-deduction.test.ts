import { describe, expect, it } from "vitest";
import {
	resolveBaseQuantityDelta,
	sortCargoIdsForUpdate,
} from "../cargo-deduction";

describe("resolveBaseQuantityDelta", () => {
	it("converts same-family weight deductions into base grams", () => {
		const result = resolveBaseQuantityDelta(
			{
				quantity: 500,
				unit: "g",
				baseQuantity: 500,
				baseUnit: "g",
				name: "flour",
			},
			-100,
		);
		expect(result.signedBaseDelta).toBe(-100);
		expect(result.useAbsoluteBase).toBeUndefined();
	});

	it("restores base quantity with a positive delta", () => {
		const result = resolveBaseQuantityDelta(
			{
				quantity: 400,
				unit: "g",
				baseQuantity: 400,
				baseUnit: "g",
				name: "flour",
			},
			100,
		);
		expect(result.signedBaseDelta).toBe(100);
	});

	it("converts kg authored units into gram base deltas", () => {
		const result = resolveBaseQuantityDelta(
			{
				quantity: 1,
				unit: "kg",
				baseQuantity: 1000,
				baseUnit: "g",
				name: "sugar",
			},
			-0.25,
		);
		expect(result.signedBaseDelta).toBe(-250);
	});

	it("returns zero when delta is zero", () => {
		const result = resolveBaseQuantityDelta(
			{
				quantity: 10,
				unit: "ml",
				baseQuantity: 10,
				baseUnit: "ml",
				name: "oil",
			},
			0,
		);
		expect(result.signedBaseDelta).toBe(0);
	});
});

describe("sortCargoIdsForUpdate", () => {
	it("sorts cargo ids lexicographically for stable multi-row updates", () => {
		expect(sortCargoIdsForUpdate(["c", "a", "b"])).toEqual(["a", "b", "c"]);
	});
});
