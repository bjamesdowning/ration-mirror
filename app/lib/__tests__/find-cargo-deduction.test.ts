import { describe, expect, it } from "vitest";
import { computeBaseFields } from "../base-quantity";
import type { CargoIndexRow } from "../cargo-index.server";
import { findCargoForDeduction } from "../meals.server";

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
