import { describe, expect, it } from "vitest";
import {
	MobileSettingsPatchSchema,
	normalizeMobileSettingsPatch,
} from "../mobile/auth";

describe("MobileSettingsPatchSchema", () => {
	it("accepts AI consent and onboarding timestamps", () => {
		const parsed = MobileSettingsPatchSchema.parse({
			aiConsentAt: "2026-06-29T12:00:00.000Z",
			onboardingCompletedAt: "2026-06-29T12:05:00.000Z",
			onboardingStep: 3,
			expirationAlertDays: 7,
		});
		expect(parsed.aiConsentAt).toBe("2026-06-29T12:00:00.000Z");
		expect(parsed.onboardingStep).toBe(3);
	});

	it("rejects empty patch objects", () => {
		const result = MobileSettingsPatchSchema.safeParse({});
		expect(result.success).toBe(false);
	});

	it("accepts unitDisplayMode patch", () => {
		const parsed = MobileSettingsPatchSchema.parse({
			unitDisplayMode: "cooking",
		});
		expect(parsed.unitDisplayMode).toBe("cooking");
	});

	it("normalizes original display mode by clearing legacy supply mode", () => {
		const parsed = MobileSettingsPatchSchema.parse({
			unitDisplayMode: "original",
			supplyUnitMode: "metric",
		});
		expect(normalizeMobileSettingsPatch(parsed)).toEqual({
			unitDisplayMode: "original",
			supplyUnitMode: undefined,
		});
	});

	it("promotes legacy supply mode patches into global display mode", () => {
		const parsed = MobileSettingsPatchSchema.parse({
			supplyUnitMode: "imperial",
		});
		expect(normalizeMobileSettingsPatch(parsed)).toEqual({
			supplyUnitMode: "imperial",
			unitDisplayMode: "imperial",
		});
	});

	it("accepts manifest settings partial patch", () => {
		const parsed = MobileSettingsPatchSchema.parse({
			manifestSettings: { weekStart: "monday", calendarSpan: 7 },
		});
		expect(parsed.manifestSettings?.weekStart).toBe("monday");
		expect(parsed.manifestSettings?.calendarSpan).toBe(7);
	});
});
