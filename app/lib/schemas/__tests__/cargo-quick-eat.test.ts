import { describe, expect, it } from "vitest";
import { CargoQuickEatRequestSchema } from "~/lib/schemas/cargo-quick-eat";

describe("CargoQuickEatRequestSchema", () => {
	it("accepts a valid payload", () => {
		const parsed = CargoQuickEatRequestSchema.parse({
			quantity: 1,
			date: "2026-08-11",
			operationKey: "11111111-1111-4111-8111-111111111111",
		});
		expect(parsed.quantity).toBe(1);
		expect(parsed.logIntake).toBeUndefined();
	});

	it("rejects non-positive quantity", () => {
		expect(() =>
			CargoQuickEatRequestSchema.parse({
				quantity: 0,
				date: "2026-08-11",
				operationKey: "11111111-1111-4111-8111-111111111111",
			}),
		).toThrow();
	});

	it("rejects invalid date", () => {
		expect(() =>
			CargoQuickEatRequestSchema.parse({
				quantity: 1,
				date: "08-11-2026",
				operationKey: "11111111-1111-4111-8111-111111111111",
			}),
		).toThrow();
	});
});
