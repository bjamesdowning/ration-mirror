import { describe, expect, it } from "vitest";
import { computeBaseFields } from "../base-quantity";
import type { CargoIndexRow } from "../cargo-index.server";
import { findCargoForDeduction } from "../meals.server";
import { getScaleFactor, scaleCookQuantity } from "../scale";

function cargoRow(
	overrides: Partial<CargoIndexRow> &
		Pick<CargoIndexRow, "id" | "name" | "quantity" | "unit">,
): CargoIndexRow {
	const base = computeBaseFields(
		overrides.quantity,
		overrides.unit,
		overrides.name,
	);
	return {
		domain: "food",
		baseQuantity: overrides.baseQuantity ?? base.baseQuantity,
		baseUnit: overrides.baseUnit ?? base.baseUnit,
		...overrides,
	};
}

describe("findCargoForDeduction", () => {
	it("returns empty allocations in strict mode when stock is insufficient", () => {
		const orgCargo = [
			cargoRow({ id: "c1", name: "Broccoli", quantity: 100, unit: "g" }),
		];

		const result = findCargoForDeduction(
			orgCargo,
			"broccoli",
			300,
			"g",
			new Map(),
			false,
		);

		expect(result.allocations).toEqual([]);
		expect(result.shortfallInTargetUnit).toBe(200);
	});

	it("returns partial allocations when allowPartial is true", () => {
		const orgCargo = [
			cargoRow({ id: "c1", name: "Broccoli", quantity: 100, unit: "g" }),
		];

		const result = findCargoForDeduction(
			orgCargo,
			"broccoli",
			300,
			"g",
			new Map(),
			true,
		);

		expect(result.allocations).toEqual([
			{ cargoId: "c1", quantityToDeduct: 100 },
		]);
		expect(result.shortfallInTargetUnit).toBe(200);
	});

	it("returns full allocation when stock satisfies requirement", () => {
		const orgCargo = [
			cargoRow({ id: "c1", name: "Broccoli", quantity: 500, unit: "g" }),
		];

		const result = findCargoForDeduction(
			orgCargo,
			"broccoli",
			300,
			"g",
			new Map(),
			true,
		);

		expect(result.allocations).toEqual([
			{ cargoId: "c1", quantityToDeduct: 300 },
		]);
		expect(result.shortfallInTargetUnit).toBe(0);
	});

	it("returns no allocations when no matching cargo exists", () => {
		const result = findCargoForDeduction(
			[],
			"eggs",
			4,
			"piece",
			new Map(),
			true,
		);

		expect(result.allocations).toEqual([]);
		expect(result.shortfallInTargetUnit).toBe(4);
	});

	it("allocates across token-matched oils for generic oil", () => {
		const orgCargo = [
			cargoRow({ id: "o1", name: "Olive Oil", quantity: 50, unit: "ml" }),
			cargoRow({ id: "o2", name: "Sunflower Oil", quantity: 80, unit: "ml" }),
		];

		const result = findCargoForDeduction(
			orgCargo,
			"oil",
			100,
			"ml",
			new Map(),
			false,
		);

		expect(result.shortfallInTargetUnit).toBe(0);
		expect(result.allocations).toHaveLength(2);
		const totalDeducted = result.allocations.reduce(
			(sum, a) => sum + a.quantityToDeduct,
			0,
		);
		expect(totalDeducted).toBe(100);
	});

	it("deducts 0.3 head for 3 garlic cloves so a strict cook can proceed", () => {
		const orgCargo = [
			cargoRow({ id: "g1", name: "Garlic", quantity: 1, unit: "head" }),
		];

		const result = findCargoForDeduction(
			orgCargo,
			"garlic",
			3,
			"clove",
			new Map(),
			false,
		);

		expect(result.shortfallInTargetUnit).toBe(0);
		expect(result.allocations).toHaveLength(1);
		expect(result.allocations[0]?.quantityToDeduct).toBeCloseTo(0.3, 5);
	});

	it("deducts a garlic bulb stored as bulb the same way as a head", () => {
		const orgCargo = [
			cargoRow({ id: "g1", name: "Garlic", quantity: 1, unit: "bulb" }),
		];

		const result = findCargoForDeduction(
			orgCargo,
			"garlic",
			3,
			"clove",
			new Map(),
			false,
		);

		expect(result.shortfallInTargetUnit).toBe(0);
		expect(result.allocations[0]?.quantityToDeduct).toBeCloseTo(0.3, 5);
	});

	it("does not deduct onion units as cloves, including in partial mode", () => {
		const orgCargo = [
			cargoRow({ id: "o1", name: "Onion", quantity: 2, unit: "unit" }),
		];

		const strict = findCargoForDeduction(
			orgCargo,
			"onion",
			3,
			"clove",
			new Map(),
			false,
		);
		const partial = findCargoForDeduction(
			orgCargo,
			"onion",
			3,
			"clove",
			new Map(),
			true,
		);

		expect(strict.allocations).toEqual([]);
		expect(strict.shortfallInTargetUnit).toBe(3);
		expect(partial.allocations).toEqual([]);
		expect(partial.shortfallInTargetUnit).toBe(3);
	});

	it("deducts a fraction of a head for one serving of a one-clove recipe", () => {
		const orgCargo = [
			cargoRow({ id: "g1", name: "Garlic", quantity: 1, unit: "head" }),
		];
		const scaled = scaleCookQuantity(1, getScaleFactor(4, 1), "clove");

		const result = findCargoForDeduction(
			orgCargo,
			"garlic",
			scaled,
			"clove",
			new Map(),
			false,
		);

		expect(scaled).toBe(0.25);
		expect(result.shortfallInTargetUnit).toBe(0);
		expect(result.allocations[0]?.quantityToDeduct).toBeCloseTo(0.025, 5);
		expect((result.allocations[0]?.quantityToDeduct ?? 0) * 4).toBeCloseTo(
			0.1,
			5,
		);
	});

	it("deducts a fraction of a loaf for one serving of a one-slice recipe", () => {
		const orgCargo = [
			cargoRow({ id: "b1", name: "Bread", quantity: 1, unit: "loaf" }),
		];
		const scaled = scaleCookQuantity(1, getScaleFactor(4, 1), "slice");

		const result = findCargoForDeduction(
			orgCargo,
			"bread",
			scaled,
			"slice",
			new Map(),
			false,
		);

		expect(result.shortfallInTargetUnit).toBe(0);
		expect(result.allocations[0]?.quantityToDeduct).toBeCloseTo(0.0125, 5);
	});

	it("deducts one whole can when one serving is a quarter of the recipe", () => {
		const orgCargo = [
			cargoRow({ id: "c1", name: "Tomatoes", quantity: 3, unit: "can" }),
		];
		const scaled = scaleCookQuantity(1, getScaleFactor(4, 1), "can");

		const result = findCargoForDeduction(
			orgCargo,
			"tomatoes",
			scaled,
			"can",
			new Map(),
			false,
		);

		expect(scaled).toBe(1);
		expect(result.allocations[0]?.quantityToDeduct).toBe(1);
		expect(result.shortfallInTargetUnit).toBe(0);
	});

	it("deducts one egg, as a twelfth of a dozen, not zero", () => {
		const orgCargo = [
			cargoRow({ id: "e1", name: "Eggs", quantity: 1, unit: "dozen" }),
		];
		const scaled = scaleCookQuantity(1, getScaleFactor(4, 1), "unit");

		const result = findCargoForDeduction(
			orgCargo,
			"eggs",
			scaled,
			"unit",
			new Map(),
			false,
		);

		expect(scaled).toBe(1);
		expect(result.shortfallInTargetUnit).toBe(0);
		expect(result.allocations[0]?.quantityToDeduct).toBeCloseTo(1 / 12, 5);
		expect(result.allocations[0]?.quantityToDeduct).toBeGreaterThan(0);
	});

	it("deducts part of a loaf for bread slices", () => {
		const orgCargo = [
			cargoRow({ id: "b1", name: "Bread", quantity: 1, unit: "loaf" }),
		];

		const result = findCargoForDeduction(
			orgCargo,
			"bread",
			4,
			"slice",
			new Map(),
			false,
		);

		expect(result.shortfallInTargetUnit).toBe(0);
		expect(result.allocations[0]?.quantityToDeduct).toBeCloseTo(0.2, 5);
	});

	it("does not deduct peanut butter for butter", () => {
		const orgCargo = [
			cargoRow({ id: "pb", name: "Peanut Butter", quantity: 500, unit: "g" }),
		];

		const result = findCargoForDeduction(
			orgCargo,
			"butter",
			100,
			"g",
			new Map(),
			true,
		);

		expect(result.allocations).toEqual([]);
		expect(result.shortfallInTargetUnit).toBe(100);
	});
});
