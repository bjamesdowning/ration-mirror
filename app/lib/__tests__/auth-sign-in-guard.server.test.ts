import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	ACCOUNT_NOT_FOUND_CODE,
	ACCOUNT_NOT_FOUND_MESSAGE,
	assertExistingUserForSignIn,
	userExistsByEmail,
} from "../auth-sign-in-guard.server";
import * as tosIntent from "../tos-signup-intent.server";

const findFirstUser = vi.fn();

vi.mock("drizzle-orm/d1", () => ({
	drizzle: () => ({
		query: {
			user: { findFirst: findFirstUser },
		},
	}),
}));

describe("auth-sign-in-guard", () => {
	beforeEach(() => {
		findFirstUser.mockReset();
	});

	it("userExistsByEmail returns false for blank / invalid email", async () => {
		await expect(userExistsByEmail({} as D1Database, "  ")).resolves.toBe(
			false,
		);
		expect(findFirstUser).not.toHaveBeenCalled();
	});

	it("userExistsByEmail normalizes casing before lookup", async () => {
		const normalizeSpy = vi.spyOn(tosIntent, "normalizeSignupEmail");
		findFirstUser.mockResolvedValue({ id: "u1" });
		await expect(
			userExistsByEmail({} as D1Database, "  Crew@Ration.APP "),
		).resolves.toBe(true);
		expect(normalizeSpy).toHaveBeenCalledWith("  Crew@Ration.APP ");
		expect(normalizeSpy).toHaveReturnedWith("crew@ration.app");
		expect(findFirstUser).toHaveBeenCalledWith(
			expect.objectContaining({
				columns: { id: true },
			}),
		);
		normalizeSpy.mockRestore();
	});

	it("userExistsByEmail returns false when no row", async () => {
		findFirstUser.mockResolvedValue(undefined);
		await expect(
			userExistsByEmail({} as D1Database, "new@ration.app"),
		).resolves.toBe(false);
	});

	it("assertExistingUserForSignIn allows an existing user", async () => {
		findFirstUser.mockResolvedValue({ id: "u1" });
		await expect(
			assertExistingUserForSignIn({} as D1Database, "crew@ration.app"),
		).resolves.toBeUndefined();
	});

	it("assertExistingUserForSignIn throws account_not_found when missing", async () => {
		findFirstUser.mockResolvedValue(null);
		await expect(
			assertExistingUserForSignIn({} as D1Database, "new@ration.app"),
		).rejects.toMatchObject({
			data: {
				error: ACCOUNT_NOT_FOUND_MESSAGE,
				code: ACCOUNT_NOT_FOUND_CODE,
			},
			init: { status: 404 },
		});
	});
});
