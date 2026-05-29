import { describe, expect, it } from "vitest";
import { oauthFlowErrorCodeSchema } from "../oauth-flow";

describe("oauthFlowErrorCodeSchema", () => {
	it("accepts known error codes", () => {
		expect(oauthFlowErrorCodeSchema.parse("missing_oauth_query")).toBe(
			"missing_oauth_query",
		);
		expect(oauthFlowErrorCodeSchema.parse("consent_rejected")).toBe(
			"consent_rejected",
		);
	});

	it("rejects unknown codes", () => {
		expect(() => oauthFlowErrorCodeSchema.parse("unknown")).toThrow();
	});
});
