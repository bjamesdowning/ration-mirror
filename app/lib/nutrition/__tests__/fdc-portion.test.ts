import { describe, expect, it } from "vitest";
import { gramsPerUnitFromPortion } from "../fdc-portion.server";

describe("gramsPerUnitFromPortion", () => {
	it("divides gramWeight by amount", () => {
		expect(
			gramsPerUnitFromPortion({
				id: 1,
				fdcId: 1007,
				portionDescription: "large",
				gramWeight: 50,
				amount: 1,
				measureUnit: "unit",
			}),
		).toBe(50);
		expect(
			gramsPerUnitFromPortion({
				id: 2,
				fdcId: 1007,
				portionDescription: null,
				gramWeight: 100,
				amount: 2,
				measureUnit: "unit",
			}),
		).toBe(50);
	});

	it("defaults amount to 1 when missing", () => {
		expect(
			gramsPerUnitFromPortion({
				id: 3,
				fdcId: 1,
				portionDescription: null,
				gramWeight: 28,
				amount: null,
				measureUnit: null,
			}),
		).toBe(28);
	});
});
