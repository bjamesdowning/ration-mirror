import { describe, expect, it } from "vitest";
import {
	extractSignedOAuthQueryParams,
	sanitizeOAuthQueryForBetterAuth,
} from "../oauth-flow";

const SIGNED =
	"client_id=test&scope=mcp%3Aread&response_type=code&state=s1&redirect_uri=http%3A%2F%2Flocalhost%3A20378%2Foauth%2Fcallback&code_challenge=abc&code_challenge_method=S256&resource=https%3A%2F%2Fmcp.ration.mayutic.com%2Fmcp&exp=9999999999&sig=fake";

describe("sanitizeOAuthQueryForBetterAuth", () => {
	it("removes orchestrator params from a flat consent URL", () => {
		const params = new URLSearchParams(SIGNED);
		params.set("flow_id", "00000000-0000-4000-8000-000000000001");
		params.set("household_selected", "1");
		const extracted = extractSignedOAuthQueryParams(params);
		expect(extracted).toContain("client_id=test");
		expect(extracted).toContain("sig=fake");
		expect(extracted).not.toContain("flow_id");
		expect(extracted).not.toContain("household_selected");
	});

	it("prefers nested oauth_query param when present", () => {
		const params = new URLSearchParams();
		params.set("oauth_query", SIGNED);
		params.set("flow_id", "x");
		expect(extractSignedOAuthQueryParams(params)).toBe(SIGNED);
	});

	it("strips orchestrator keys from polluted form values", () => {
		const polluted = `${SIGNED}&flow_id=abc&post_login=true`;
		const clean = sanitizeOAuthQueryForBetterAuth(polluted);
		expect(clean).toContain("sig=fake");
		expect(clean).not.toContain("flow_id");
		expect(clean).not.toContain("post_login");
	});
});
