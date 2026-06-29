import { describe, expect, it } from "vitest";
import { MobileSettingsPatchSchema } from "../mobile/auth";

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
});
