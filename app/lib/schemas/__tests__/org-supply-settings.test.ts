import { describe, expect, it } from "vitest";
import { OrganizationSupplySettingsPatchSchema } from "../org-supply-settings";

describe("OrganizationSupplySettingsPatchSchema", () => {
	it("accepts horizon days within 1–30", () => {
		expect(
			OrganizationSupplySettingsPatchSchema.safeParse({
				manifestHorizonDays: 14,
			}).success,
		).toBe(true);
	});

	it("coerces string numbers", () => {
		const parsed = OrganizationSupplySettingsPatchSchema.parse({
			manifestHorizonDays: "21",
		});
		expect(parsed.manifestHorizonDays).toBe(21);
	});

	it("rejects values below 1", () => {
		expect(
			OrganizationSupplySettingsPatchSchema.safeParse({
				manifestHorizonDays: 0,
			}).success,
		).toBe(false);
	});

	it("rejects values above 30", () => {
		expect(
			OrganizationSupplySettingsPatchSchema.safeParse({
				manifestHorizonDays: 31,
			}).success,
		).toBe(false);
	});
});
