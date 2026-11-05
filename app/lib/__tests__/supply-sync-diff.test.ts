import { describe, expect, it } from "vitest";
import {
	diffSupplyRows,
	formatSupplySyncCounts,
	readSupplySyncChangeLabel,
	type SupplyDiffLine,
	supplyItemToDiffLine,
} from "../supply-sync-diff";

const zeros = { newLines: 0, removedLines: 0, changedLines: 0 };

function line(
	overrides: Partial<SupplyDiffLine> & Pick<SupplyDiffLine, "normalizedName">,
): SupplyDiffLine {
	return {
		domain: "food",
		unit: "g",
		quantity: 100,
		...overrides,
	};
}

describe("diffSupplyRows", () => {
	it("reports zeros when the plan is unchanged, including a rewrite of the same lines", () => {
		const before = [
			line({ normalizedName: "flour", quantity: 500 }),
			line({ normalizedName: "milk", unit: "ml", quantity: 200 }),
		];
		const rewritten = before.map((row) => ({ ...row }));
		expect(diffSupplyRows(before, rewritten)).toEqual(zeros);
		expect(diffSupplyRows([], [])).toEqual(zeros);
	});

	it("counts only the new meal's missing lines as new", () => {
		const flour = line({ normalizedName: "flour", quantity: 500 });
		const tomato = line({
			normalizedName: "tomato",
			unit: "unit",
			quantity: 3,
		});
		expect(diffSupplyRows([flour], [flour, tomato])).toEqual({
			newLines: 1,
			removedLines: 0,
			changedLines: 0,
		});
		expect(
			diffSupplyRows([flour], [{ ...flour, quantity: 800 }, tomato]),
		).toEqual({
			newLines: 1,
			removedLines: 0,
			changedLines: 1,
		});
	});

	it("counts a cargo restock as new once", () => {
		const restock = supplyItemToDiffLine({
			name: "Oat milk",
			domain: "food",
			unit: "ml",
			quantity: 1,
			baseUnit: "ml",
			baseQuantity: 1000,
		});
		expect(diffSupplyRows([], [restock])).toEqual({
			newLines: 1,
			removedLines: 0,
			changedLines: 0,
		});
		expect(diffSupplyRows([restock], [restock])).toEqual(zeros);
	});

	it("counts a dropped line as removed and a quantity change as changed", () => {
		const flour = line({ normalizedName: "flour", quantity: 500 });
		const eggs = line({ normalizedName: "egg", unit: "unit", quantity: 6 });
		expect(diffSupplyRows([flour, eggs], [flour])).toEqual({
			newLines: 0,
			removedLines: 1,
			changedLines: 0,
		});
		expect(diffSupplyRows([eggs], [{ ...eggs, quantity: 12 }])).toEqual({
			newLines: 0,
			removedLines: 0,
			changedLines: 1,
		});
	});

	it("treats a different unit as a different line", () => {
		const grams = line({ normalizedName: "flour", unit: "g", quantity: 500 });
		const millilitres = line({
			normalizedName: "flour",
			unit: "ml",
			quantity: 500,
		});
		expect(diffSupplyRows([grams], [millilitres])).toEqual({
			newLines: 1,
			removedLines: 1,
			changedLines: 0,
		});
	});

	it("sums duplicate keys so a split row with the same total is unchanged", () => {
		const half = line({ normalizedName: "flour", quantity: 250 });
		expect(
			diffSupplyRows(
				[half, half],
				[line({ normalizedName: "flour", quantity: 500 })],
			),
		).toEqual(zeros);
	});

	it("ignores float dust below the shopping epsilon", () => {
		const flour = line({ normalizedName: "flour", quantity: 500 });
		expect(
			diffSupplyRows([flour], [{ ...flour, quantity: 500.00001 }]),
		).toEqual(zeros);
	});

	it("matches paper-towel synonyms through the stored name", () => {
		const before = supplyItemToDiffLine({
			name: "Paper Towels",
			domain: "household",
			unit: "unit",
			quantity: 1,
			baseUnit: "unit",
			baseQuantity: 1,
		});
		const after = supplyItemToDiffLine({
			name: "paper towels",
			domain: "household",
			unit: "unit",
			quantity: 1,
			baseUnit: "unit",
			baseQuantity: 1,
		});
		expect(diffSupplyRows([before], [after])).toEqual(zeros);
	});
});

describe("formatSupplySyncCounts", () => {
	it("says how many lines are new, removed, and changed", () => {
		expect(
			formatSupplySyncCounts({
				newLines: 3,
				removedLines: 1,
				changedLines: 2,
			}),
		).toBe("3 new, 1 removed, 2 changed");
	});
});

describe("readSupplySyncChangeLabel", () => {
	it("reads counts from a tool envelope", () => {
		expect(
			readSupplySyncChangeLabel({
				ok: true,
				tool: "sync_supply_from_selected_meals",
				data: {
					summary: { newLines: 3, removedLines: 1, changedLines: 2 },
				},
			}),
		).toBe("3 new, 1 removed, 2 changed");
	});

	it("returns null when the payload has no line counts", () => {
		expect(readSupplySyncChangeLabel({ ok: true, data: {} })).toBeNull();
		expect(readSupplySyncChangeLabel(null)).toBeNull();
	});
});
