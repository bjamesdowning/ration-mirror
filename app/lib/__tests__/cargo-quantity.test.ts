import { describe, expect, it } from "vitest";
import { CargoItemSchema } from "~/lib/cargo.server";
import {
	formatQuantityNumericString,
	normalizeCargoQuantity,
} from "~/lib/format-quantity";

describe("normalizeCargoQuantity", () => {
	it("rounds float noise to sensible decimals", () => {
		expect(normalizeCargoQuantity(0.3 + 1e-16, "g")).toBe(0.3);
		expect(normalizeCargoQuantity(2.272, "l")).toBe(2.27);
	});

	it("rounds count units to integers", () => {
		expect(normalizeCargoQuantity(2.7, "unit")).toBe(3);
		expect(normalizeCargoQuantity(1.2, "can")).toBe(1);
	});

	it("uses one decimal place for values >= 10", () => {
		expect(normalizeCargoQuantity(12.345, "g")).toBe(12.3);
		expect(normalizeCargoQuantity(10.04, "ml")).toBe(10);
	});
});

describe("formatQuantityNumericString", () => {
	it("trims trailing zeros for display", () => {
		expect(formatQuantityNumericString(22.2, "g")).toBe("22.2");
		expect(formatQuantityNumericString(3, "g")).toBe("3");
	});
});

describe("CargoItemSchema quantity normalization", () => {
	it("normalizes quantity on parse", () => {
		const result = CargoItemSchema.safeParse({
			name: "Flour",
			quantity: "0.30000000000000004",
			unit: "g",
			domain: "food",
			tags: [],
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.quantity).toBe(0.3);
			expect(result.data.name).toBe("flour");
		}
	});

	it("rounds count units on parse", () => {
		const result = CargoItemSchema.safeParse({
			name: "Eggs",
			quantity: "2.8",
			unit: "unit",
			domain: "food",
			tags: [],
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.quantity).toBe(3);
		}
	});
});
