import { describe, expect, it, vi } from "vitest";
import {
	mapBetterAuthConsentError,
	mapUnknownConsentError,
} from "../oauth-route-errors.server";

vi.mock("../oauth-telemetry.server", () => ({
	logOAuthFlowEvent: vi.fn(),
	oauthUserMessage: (code: string) => `msg:${code}`,
}));

describe("mapBetterAuthConsentError", () => {
	it("maps invalid signature to flow_invalid", () => {
		const mapped = mapBetterAuthConsentError(
			new Error("invalid_signature: token expired"),
		);
		expect(mapped.errorCode).toBe("flow_invalid");
		expect(mapped.error).toContain("expired");
	});

	it("maps scope errors to flow_invalid", () => {
		const mapped = mapBetterAuthConsentError(
			new Error("Scope not originally requested"),
		);
		expect(mapped.errorCode).toBe("flow_invalid");
	});
});

describe("mapUnknownConsentError", () => {
	it("does not expose error detail in the client payload", () => {
		const result = mapUnknownConsentError(new Error("secret internal"), {
			step: "consent",
		});
		const body = result.data as Record<string, unknown>;
		expect(body).not.toHaveProperty("detail");
		expect(body.errorCode).toBe("consent_rejected");
	});
});
