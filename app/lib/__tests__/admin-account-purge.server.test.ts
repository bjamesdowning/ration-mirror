import { beforeEach, describe, expect, it, vi } from "vitest";

const checkRateLimit = vi.fn();
const beginAdminAccountPurge = vi.fn();
const findUsers = vi.fn();

vi.mock("~/lib/rate-limiter.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/rate-limiter.server")>();
	return {
		...actual,
		checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
	};
});

vi.mock("~/lib/user-purge.server", () => ({
	beginAdminAccountPurge: (...args: unknown[]) =>
		beginAdminAccountPurge(...args),
}));

vi.mock("~/db/schema", () => ({
	user: {
		id: "id",
		email: "email",
		isAdmin: "isAdmin",
		stripeCustomerId: "stripeCustomerId",
	},
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: () => ({
		select: () => ({
			from: () => ({
				where: () => ({
					limit: () => findUsers(),
				}),
			}),
		}),
	}),
}));

const env = { DB: {}, RATION_KV: {} } as unknown as Cloudflare.Env;
const waitUntil = vi.fn();
const ctx = { waitUntil };

const targetUser = {
	id: "user_2",
	email: "alice@test.com",
	isAdmin: false,
	stripeCustomerId: "cus_123",
};

describe("handleAdminDeleteAccount", () => {
	beforeEach(() => {
		for (const m of [
			checkRateLimit,
			beginAdminAccountPurge,
			findUsers,
			waitUntil,
		]) {
			m.mockReset();
		}
		checkRateLimit.mockResolvedValue({ allowed: true });
		findUsers.mockResolvedValue([targetUser]);
		beginAdminAccountPurge.mockResolvedValue({ jobId: "job-1" });
	});

	it("begins the standard account purge", async () => {
		const { handleAdminDeleteAccount } = await import(
			"~/lib/admin-account-purge.server"
		);
		const result = await handleAdminDeleteAccount({
			env,
			ctx,
			adminUserId: "admin_1",
			userId: "user_2",
			confirmEmail: "alice@test.com",
		});

		expect(result).toEqual({ kind: "accepted", jobId: "job-1" });
		expect(beginAdminAccountPurge).toHaveBeenCalledWith(env, ctx, {
			userId: "user_2",
			email: "alice@test.com",
			stripeCustomerId: "cus_123",
		});
	});

	it("rejects deleting yourself", async () => {
		findUsers.mockResolvedValue([{ ...targetUser, id: "admin_1" }]);
		const { handleAdminDeleteAccount } = await import(
			"~/lib/admin-account-purge.server"
		);
		const result = await handleAdminDeleteAccount({
			env,
			ctx,
			adminUserId: "admin_1",
			userId: "admin_1",
			confirmEmail: "alice@test.com",
		});

		expect(result).toEqual({
			kind: "denied",
			status: 400,
			error: "Cannot delete your own account",
		});
		expect(beginAdminAccountPurge).not.toHaveBeenCalled();
	});

	it("rejects deleting another admin", async () => {
		findUsers.mockResolvedValue([{ ...targetUser, isAdmin: true }]);
		const { handleAdminDeleteAccount } = await import(
			"~/lib/admin-account-purge.server"
		);
		const result = await handleAdminDeleteAccount({
			env,
			ctx,
			adminUserId: "admin_1",
			userId: "user_2",
			confirmEmail: "alice@test.com",
		});

		expect(result).toEqual({
			kind: "denied",
			status: 400,
			error: "Revoke admin before deleting this account",
		});
		expect(beginAdminAccountPurge).not.toHaveBeenCalled();
	});

	it("rejects a mismatched confirmation email", async () => {
		const { handleAdminDeleteAccount } = await import(
			"~/lib/admin-account-purge.server"
		);
		const result = await handleAdminDeleteAccount({
			env,
			ctx,
			adminUserId: "admin_1",
			userId: "user_2",
			confirmEmail: "other@test.com",
		});

		expect(result).toEqual({
			kind: "denied",
			status: 400,
			error: "Confirmation email does not match this account",
		});
		expect(beginAdminAccountPurge).not.toHaveBeenCalled();
	});

	it("returns rate_limited when the account-purge bucket is exceeded", async () => {
		const rateLimit = {
			allowed: false,
			retryAfter: 30,
			resetAt: 1_700_000_000_000,
		};
		checkRateLimit.mockResolvedValue(rateLimit);
		const { handleAdminDeleteAccount } = await import(
			"~/lib/admin-account-purge.server"
		);
		const result = await handleAdminDeleteAccount({
			env,
			ctx,
			adminUserId: "admin_1",
			userId: "user_2",
			confirmEmail: "alice@test.com",
		});

		expect(checkRateLimit).toHaveBeenCalledWith(
			{},
			"admin_account_purge",
			"admin_1",
		);
		expect(result).toEqual({ kind: "rate_limited", result: rateLimit });
		expect(beginAdminAccountPurge).not.toHaveBeenCalled();
	});
});
