import { describe, expect, it } from "vitest";
import { evaluateAccountDeletionEligibility } from "~/lib/account-deletion-gate";

describe("evaluateAccountDeletionEligibility", () => {
	const now = new Date("2026-07-16T12:00:00.000Z");

	it("blocks renewing Crew members", () => {
		const result = evaluateAccountDeletionEligibility({
			tier: "crew_member",
			tierExpiresAt: "2026-12-01T00:00:00.000Z",
			subscriptionCancelAtPeriodEnd: false,
			now,
		});
		expect(result.canDelete).toBe(false);
		expect(result.blockReason).toBe("active_subscription");
		expect(result.cancelAtPeriodEnd).toBe(false);
	});

	it("allows delete when cancel-at-period-end is set", () => {
		const result = evaluateAccountDeletionEligibility({
			tier: "crew_member",
			tierExpiresAt: "2026-12-01T00:00:00.000Z",
			subscriptionCancelAtPeriodEnd: true,
			now,
		});
		expect(result.canDelete).toBe(true);
		expect(result.blockReason).toBeNull();
		expect(result.cancelAtPeriodEnd).toBe(true);
		expect(result.message).toMatch(/lose access/i);
	});

	it("allows free users", () => {
		const result = evaluateAccountDeletionEligibility({
			tier: "free",
			tierExpiresAt: null,
			subscriptionCancelAtPeriodEnd: false,
			now,
		});
		expect(result.canDelete).toBe(true);
		expect(result.effectiveTier).toBe("free");
	});

	it("treats expired Crew as free (allowed)", () => {
		const result = evaluateAccountDeletionEligibility({
			tier: "crew_member",
			tierExpiresAt: "2026-01-01T00:00:00.000Z",
			subscriptionCancelAtPeriodEnd: false,
			now,
		});
		expect(result.canDelete).toBe(true);
		expect(result.effectiveTier).toBe("free");
	});
});
