import { describe, expect, it } from "vitest";
import type { CargoIndexRow } from "../cargo-index.server";
import { findCargoForDeduction } from "../meals.server";

function cargoRow(
	overrides: Partial<CargoIndexRow> &
		Pick<CargoIndexRow, "id" | "name" | "quantity" | "unit">,
): CargoIndexRow {
	return {
		domain: "food",
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
});
