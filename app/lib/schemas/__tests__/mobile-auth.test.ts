import { describe, expect, it } from "vitest";
import {
	MobileSettingsPatchSchema,
	MobileSocialAuthSchema,
	normalizeMobileSettingsPatch,
} from "../mobile/auth";

describe("MobileSocialAuthSchema", () => {
	it("allows Sign In without tosAccepted", () => {
		const withoutTos = MobileSocialAuthSchema.safeParse({
			provider: "google",
			idToken: "token",
			intent: "signIn",
		});
		expect(withoutTos.success).toBe(true);
	});

	it("requires tosAccepted for Sign Up", () => {
		const withoutTos = MobileSocialAuthSchema.safeParse({
			provider: "google",
			idToken: "token",
			intent: "signUp",
		});
		expect(withoutTos.success).toBe(false);
	});

	it("accepts Google Sign Up payloads with ToS", () => {
		const parsed = MobileSocialAuthSchema.parse({
			provider: "google",
			idToken: "token",
			intent: "signUp",
			tosAccepted: true,
		});
		expect(parsed.provider).toBe("google");
		expect(parsed.intent).toBe("signUp");
	});

	it("requires nonce for Apple sign-in", () => {
		const result = MobileSocialAuthSchema.safeParse({
			provider: "apple",
			idToken: "token",
			intent: "signIn",
		});
		expect(result.success).toBe(false);
	});

	it("accepts Apple idToken with nonce on Sign In", () => {
		const parsed = MobileSocialAuthSchema.parse({
			provider: "apple",
			idToken: "token",
			nonce: "raw-nonce",
			intent: "signIn",
		});
		expect(parsed.provider).toBe("apple");
	});
});

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

	it("accepts restartOnboarding flag", () => {
		const parsed = MobileSettingsPatchSchema.parse({
			restartOnboarding: true,
		});
		expect(parsed.restartOnboarding).toBe(true);
	});
});
