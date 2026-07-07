import { describe, expect, it } from "vitest";
import { computeBaseFields } from "../base-quantity";
import {
	buildCargoRestockTarget,
	computeCargoDockCreditBase,
	type DockedSupplyItemForReconcile,
	resolveRemainingCargoRestockQuantity,
} from "../supply-dock-reconcile";

function dockedItem(
	overrides: Partial<DockedSupplyItemForReconcile> & {
		quantity: number;
		unit: string;
		sourceOrigins: DockedSupplyItemForReconcile["sourceOrigins"];
	},
): DockedSupplyItemForReconcile {
	const base = computeBaseFields(
		overrides.quantity,
		overrides.unit,
		overrides.name ?? "onion",
	);
	return {
		name: "onion",
		domain: "food",
		baseQuantity: base.baseQuantity,
		baseUnit: base.baseUnit,
		sourceCargoId: null,
		...overrides,
	};
}

describe("computeCargoDockCreditBase", () => {
	const cargoTarget = buildCargoRestockTarget(
		"cargo-1",
		"onion",
		"food",
		"unit",
		1,
	);

	it("credits full dock qty for cargo-only rows", () => {
		const credit = computeCargoDockCreditBase(
			dockedItem({
				quantity: 1,
				unit: "unit",
				sourceOrigins: ["cargo"],
				sourceCargoId: "cargo-1",
			}),
			cargoTarget,
		);
		expect(credit).toBe(1);
	});

	it("allocates meal need first on mixed manifest+galley+cargo rows", () => {
		const mixedThree = dockedItem({
			quantity: 3,
			unit: "unit",
			sourceOrigins: ["manifest", "galley", "cargo"],
		});
		expect(computeCargoDockCreditBase(mixedThree, cargoTarget)).toBe(1);

		const mixedTwoMealOnly = dockedItem({
			quantity: 2,
			unit: "unit",
			sourceOrigins: ["manifest", "galley"],
		});
		expect(computeCargoDockCreditBase(mixedTwoMealOnly, cargoTarget)).toBe(0);

		const cargoOnlyRemainder = dockedItem({
			quantity: 1,
			unit: "unit",
			sourceOrigins: ["cargo"],
			sourceCargoId: "cargo-1",
		});
		expect(computeCargoDockCreditBase(cargoOnlyRemainder, cargoTarget)).toBe(1);
	});
});

describe("resolveRemainingCargoRestockQuantity", () => {
	const target = buildCargoRestockTarget("cargo-1", "onion", "food", "unit", 1);

	it("returns null when restock intent is fully fulfilled", () => {
		expect(resolveRemainingCargoRestockQuantity(target, 1)).toBeNull();
	});

	it("returns reduced quantity when partially fulfilled", () => {
		const halfBase = target.restockBaseQuantity / 2;
		const remaining = resolveRemainingCargoRestockQuantity(target, halfBase);
		expect(remaining).not.toBeNull();
		expect(remaining).toBeGreaterThan(0);
		expect(remaining).toBeLessThan(1);
	});
});
