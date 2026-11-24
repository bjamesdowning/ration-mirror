import { describe, expect, it } from "vitest";
import { ManifestPersonalIntakeUpsertSchema } from "../manifest";

const key = "22222222-2222-4222-8222-222222222222";

describe("Manifest plate-up fuelDate", () => {
	it("accepts the line's day and a future day", () => {
		expect(
			ManifestPersonalIntakeUpsertSchema.parse({
				servings: 1,
				idempotencyKey: key,
				fuelDate: "2026-11-20",
			}).fuelDate,
		).toBe("2026-11-20");
		expect(
			ManifestPersonalIntakeUpsertSchema.parse({
				servings: 1,
				idempotencyKey: key,
				fuelDate: "2027-06-01",
			}).fuelDate,
		).toBe("2027-06-01");
	});

	it("rejects a day that is not real", () => {
		expect(() =>
			ManifestPersonalIntakeUpsertSchema.parse({
				servings: 1,
				idempotencyKey: key,
				fuelDate: "2026-02-31",
			}),
		).toThrow();
	});
});
