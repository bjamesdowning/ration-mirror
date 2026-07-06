import { describe, expect, it } from "vitest";
import { CargoRestockQuantitySchema } from "../cargo-selection";

describe("CargoRestockQuantitySchema", () => {
	it("accepts a positive quantity", () => {
		expect(CargoRestockQuantitySchema.safeParse({ quantity: 2 }).success).toBe(
			true,
		);
	});

	it("rejects zero and negative quantities", () => {
		expect(CargoRestockQuantitySchema.safeParse({ quantity: 0 }).success).toBe(
			false,
		);
		expect(CargoRestockQuantitySchema.safeParse({ quantity: -1 }).success).toBe(
			false,
		);
	});

	it("rejects quantities above cap", () => {
		expect(
			CargoRestockQuantitySchema.safeParse({ quantity: 10000 }).success,
		).toBe(false);
	});

	it("allows empty body for plain toggle", () => {
		expect(CargoRestockQuantitySchema.safeParse({}).success).toBe(true);
	});
});
