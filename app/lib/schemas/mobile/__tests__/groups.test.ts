import { describe, expect, it } from "vitest";
import { MobileDeleteGroupSchema } from "../groups";

describe("MobileDeleteGroupSchema", () => {
	it("requires organizationId", () => {
		expect(MobileDeleteGroupSchema.safeParse({}).success).toBe(false);
		expect(
			MobileDeleteGroupSchema.safeParse({ organizationId: "" }).success,
		).toBe(false);
	});

	it("accepts organizationId alone", () => {
		const result = MobileDeleteGroupSchema.safeParse({
			organizationId: "org-1",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.acknowledgeCreditForfeit).toBeUndefined();
		}
	});

	it("accepts optional acknowledgeCreditForfeit", () => {
		const result = MobileDeleteGroupSchema.safeParse({
			organizationId: "org-1",
			acknowledgeCreditForfeit: true,
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.acknowledgeCreditForfeit).toBe(true);
		}
	});

	it("rejects a non-boolean acknowledgeCreditForfeit", () => {
		expect(
			MobileDeleteGroupSchema.safeParse({
				organizationId: "org-1",
				acknowledgeCreditForfeit: "true",
			}).success,
		).toBe(false);
	});
});
