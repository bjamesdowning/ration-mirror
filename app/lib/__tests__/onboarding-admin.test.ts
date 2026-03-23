import { describe, expect, it } from "vitest";
import { formatOnboardingAdminLabel } from "~/lib/onboarding-admin";

describe("formatOnboardingAdminLabel", () => {
	it("returns em-dash for null or undefined", () => {
		expect(formatOnboardingAdminLabel(null)).toBe("—");
		expect(formatOnboardingAdminLabel(undefined)).toBe("—");
	});

	it("returns em-dash for non-object", () => {
		expect(formatOnboardingAdminLabel("")).toBe("—");
		expect(formatOnboardingAdminLabel(42)).toBe("—");
		expect(formatOnboardingAdminLabel([])).toBe("—");
	});

	it("returns Completed when onboardingCompletedAt is a non-empty string", () => {
		expect(
			formatOnboardingAdminLabel({
				onboardingCompletedAt: "2025-01-15T12:00:00Z",
			}),
		).toBe("Completed");
		expect(formatOnboardingAdminLabel({ onboardingCompletedAt: "x" })).toBe(
			"Completed",
		);
	});

	it("ignores empty onboardingCompletedAt", () => {
		expect(formatOnboardingAdminLabel({ onboardingCompletedAt: "" })).toBe(
			"Not started",
		);
	});

	it("returns Step N/7 for valid onboardingStep", () => {
		expect(formatOnboardingAdminLabel({ onboardingStep: 0 })).toBe("Step 1/7");
		expect(formatOnboardingAdminLabel({ onboardingStep: 3 })).toBe("Step 4/7");
		expect(formatOnboardingAdminLabel({ onboardingStep: 6 })).toBe("Step 7/7");
	});

	it("clamps onboardingStep above max to 7/7", () => {
		expect(formatOnboardingAdminLabel({ onboardingStep: 99 })).toBe("Step 7/7");
	});

	it("prefers Completed over onboardingStep when both present", () => {
		expect(
			formatOnboardingAdminLabel({
				onboardingCompletedAt: "2025-01-15",
				onboardingStep: 3,
			}),
		).toBe("Completed");
	});

	it("returns Not started for empty object", () => {
		expect(formatOnboardingAdminLabel({})).toBe("Not started");
	});

	it("returns Not started when onboardingStep is invalid", () => {
		expect(formatOnboardingAdminLabel({ onboardingStep: "3" })).toBe(
			"Not started",
		);
		expect(formatOnboardingAdminLabel({ onboardingStep: NaN })).toBe(
			"Not started",
		);
		expect(formatOnboardingAdminLabel({ onboardingStep: -1 })).toBe(
			"Not started",
		);
	});
});
