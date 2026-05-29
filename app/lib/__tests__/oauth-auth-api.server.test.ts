import { describe, expect, it } from "vitest";
import { throwIfAuthHandlerFailed } from "../oauth-auth-http.server";

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
