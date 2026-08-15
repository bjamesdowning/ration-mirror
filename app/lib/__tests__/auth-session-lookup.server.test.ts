import { APIError } from "better-auth";
import { describe, expect, it } from "vitest";
import { isTransientAuthSessionLookupError } from "~/lib/auth-session-lookup.server";

describe("isTransientAuthSessionLookupError", () => {
	it("returns true for D1 contention strings", () => {
		expect(
			isTransientAuthSessionLookupError(
				new Error(
					"D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset.",
				),
			),
		).toBe(true);
	});

	it("returns true for Better Auth 500 FAILED_TO_GET_SESSION (cause stripped)", () => {
		const err = new APIError("INTERNAL_SERVER_ERROR", {
			message: "Failed to get session",
			code: "FAILED_TO_GET_SESSION",
		});
		expect(err.statusCode).toBe(500);
		expect(isTransientAuthSessionLookupError(err)).toBe(true);
	});

	it("returns false for UNAUTHORIZED FAILED_TO_GET_SESSION", () => {
		const err = new APIError("UNAUTHORIZED", {
			message: "Failed to get session",
			code: "FAILED_TO_GET_SESSION",
		});
		expect(err.statusCode).toBe(401);
		expect(isTransientAuthSessionLookupError(err)).toBe(false);
	});

	it("returns false for unrelated errors", () => {
		expect(isTransientAuthSessionLookupError(new Error("Zod validation"))).toBe(
			false,
		);
		expect(
			isTransientAuthSessionLookupError(
				new APIError("BAD_REQUEST", { message: "signup_disabled" }),
			),
		).toBe(false);
	});
});
