import { describe, expect, it, vi } from "vitest";
import { mapUnknownConsentError } from "../oauth-route-errors.server";

vi.mock("../oauth-telemetry.server", () => ({
	logOAuthFlowEvent: vi.fn(),
	oauthUserMessage: (code: string) => `msg:${code}`,
}));

describe("mapUnknownConsentError", () => {
	it("does not expose error detail in the client payload", () => {
		const result = mapUnknownConsentError(new Error("secret internal"), {
			flowId: "00000000-0000-4000-8000-000000000099",
		});
		const body = result.data as Record<string, unknown>;
		expect(body.error).toBe("msg:consent_rejected");
		expect(body.errorCode).toBe("consent_rejected");
		expect(body).not.toHaveProperty("detail");
	});
});
