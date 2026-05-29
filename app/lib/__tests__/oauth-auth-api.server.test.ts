import { describe, expect, it } from "vitest";
import {
	internalAuthOrigin,
	throwIfAuthHandlerFailed,
} from "../oauth-auth-http.server";

describe("internalAuthOrigin", () => {
	it("derives the worker origin from a .data action request URL", () => {
		const request = new Request(
			"https://ration.mayutic.com/oauth/select-org.data?oauth_query=abc",
			{ method: "POST" },
		);
		expect(internalAuthOrigin(request)).toBe("https://ration.mayutic.com");
	});

	it("strips path and query so it matches the default trustedOrigin (baseURL)", () => {
		const request = new Request(
			"https://ration.mayutic.com/api/auth/organization/set-active",
		);
		expect(internalAuthOrigin(request)).toBe("https://ration.mayutic.com");
	});

	it("preserves non-standard ports for local development", () => {
		const request = new Request("http://localhost:5173/oauth/consent.data");
		expect(internalAuthOrigin(request)).toBe("http://localhost:5173");
	});
});

describe("throwIfAuthHandlerFailed", () => {
	it("throws with Better Auth error_description from JSON body", async () => {
		const response = new Response(
			JSON.stringify({
				error: "invalid_request",
				error_description: "missing oauth query",
			}),
			{ status: 400, headers: { "Content-Type": "application/json" } },
		);
		await expect(throwIfAuthHandlerFailed(response)).rejects.toThrow(
			/missing oauth query/i,
		);
	});
});
