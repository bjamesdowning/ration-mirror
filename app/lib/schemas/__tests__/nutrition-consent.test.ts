import { describe, expect, it } from "vitest";
import { NutritionPrivacyActionSchema } from "../nutrition-consent";

describe("NutritionPrivacyActionSchema", () => {
	it("accepts a version-bound explicit grant", () => {
		const parsed = NutritionPrivacyActionSchema.parse({
			action: "grant",
			purpose: "intake",
			policyVersion: "2026-08-09",
			statementVersion: "intake-2026-08-09.1",
			statementSha256: "a".repeat(64),
			affirmed: true,
			requestId: "11111111-1111-4111-8111-111111111111",
		});
		expect(parsed.action).toBe("grant");
		if (parsed.action !== "grant") throw new Error("expected grant");
		expect(parsed.purpose).toBe("intake");
	});

	it("rejects grants without explicit affirmation", () => {
		expect(() =>
			NutritionPrivacyActionSchema.parse({
				action: "grant",
				purpose: "goals",
				policyVersion: "2026-08-09",
				statementVersion: "goals-2026-08-09.1",
				statementSha256: "a".repeat(64),
				affirmed: false,
				requestId: "11111111-1111-4111-8111-111111111111",
			}),
		).toThrow();
	});

	it("accepts withdrawal and erasure request IDs", () => {
		expect(
			NutritionPrivacyActionSchema.parse({
				action: "withdraw",
				purpose: "agent_processing",
				requestId: "22222222-2222-4222-8222-222222222222",
			}).action,
		).toBe("withdraw");
		expect(
			NutritionPrivacyActionSchema.parse({
				action: "erase",
				dataset: "all",
				requestId: "33333333-3333-4333-8333-333333333333",
			}).action,
		).toBe("erase");
	});
});
