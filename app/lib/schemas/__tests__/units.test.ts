import { describe, expect, it } from "vitest";
import { UnitSchema } from "~/lib/schemas/units";
import { SUPPORTED_UNITS } from "~/lib/units";

describe("UnitSchema", () => {
	it("accepts all SUPPORTED_UNITS", () => {
		for (const unit of SUPPORTED_UNITS) {
			const result = UnitSchema.safeParse(unit);
			expect(result.success, `Expected ${unit} to be valid`).toBe(true);
		}
	});

	it("rejects unknown unit strings", () => {
		expect(UnitSchema.safeParse("stone").success).toBe(false);
		expect(UnitSchema.safeParse("").success).toBe(false);
		expect(UnitSchema.safeParse("banana").success).toBe(false);
	});

	it("rejects null and undefined", () => {
		expect(UnitSchema.safeParse(null).success).toBe(false);
		expect(UnitSchema.safeParse(undefined).success).toBe(false);
	});

	it("is case-sensitive (rejects uppercase variants)", () => {
		// SUPPORTED_UNITS contains lowercase keys; uppercase should fail
		expect(UnitSchema.safeParse("G").success).toBe(false);
		expect(UnitSchema.safeParse("KG").success).toBe(false);
	});
});
