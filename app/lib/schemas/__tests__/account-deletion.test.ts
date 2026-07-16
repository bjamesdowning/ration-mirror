import { describe, expect, it } from "vitest";
import { AccountDeletionPreviewSchema } from "~/lib/schemas/account-deletion";

describe("AccountDeletionPreviewSchema", () => {
	it("accepts a complete preview payload", () => {
		const parsed = AccountDeletionPreviewSchema.parse({
			ownedGroupsWithNoOtherMembers: ["Kitchen"],
			canDelete: false,
			blockReason: "active_subscription",
			cancelAtPeriodEnd: false,
			tierExpiresAt: "2026-12-01T00:00:00.000Z",
			message: "Cancel first",
			managementUrl: "https://billing.example",
			billingProvider: "app_store",
		});
		expect(parsed.canDelete).toBe(false);
		expect(parsed.blockReason).toBe("active_subscription");
	});

	it("rejects missing canDelete", () => {
		expect(() =>
			AccountDeletionPreviewSchema.parse({
				ownedGroupsWithNoOtherMembers: [],
				blockReason: null,
				cancelAtPeriodEnd: false,
				tierExpiresAt: null,
				message: "ok",
				managementUrl: null,
				billingProvider: null,
			}),
		).toThrow();
	});
});
