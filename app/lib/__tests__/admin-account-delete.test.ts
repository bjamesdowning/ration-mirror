import { describe, expect, it } from "vitest";
import { evaluateAdminAccountDelete } from "../admin-account-delete";

const target = {
	id: "user_2",
	email: "alice@test.com",
	isAdmin: false,
	stripeCustomerId: "cus_123",
};

describe("evaluateAdminAccountDelete", () => {
	it("allows a matching non-admin target", () => {
		expect(
			evaluateAdminAccountDelete({
				adminUserId: "admin_1",
				target,
				confirmEmail: "  ALICE@test.com ",
			}),
		).toEqual({ ok: true, target });
	});

	it("rejects a missing user", () => {
		expect(
			evaluateAdminAccountDelete({
				adminUserId: "admin_1",
				target: null,
				confirmEmail: "alice@test.com",
			}),
		).toEqual({ ok: false, status: 404, error: "User not found" });
	});

	it("rejects deleting yourself", () => {
		expect(
			evaluateAdminAccountDelete({
				adminUserId: "user_2",
				target,
				confirmEmail: "alice@test.com",
			}),
		).toEqual({
			ok: false,
			status: 400,
			error: "Cannot delete your own account",
		});
	});

	it("rejects deleting another admin", () => {
		expect(
			evaluateAdminAccountDelete({
				adminUserId: "admin_1",
				target: { ...target, isAdmin: true },
				confirmEmail: "alice@test.com",
			}),
		).toEqual({
			ok: false,
			status: 400,
			error: "Revoke admin before deleting this account",
		});
	});

	it("rejects a mismatched confirmation email", () => {
		expect(
			evaluateAdminAccountDelete({
				adminUserId: "admin_1",
				target,
				confirmEmail: "other@test.com",
			}),
		).toEqual({
			ok: false,
			status: 400,
			error: "Confirmation email does not match this account",
		});
	});
});
