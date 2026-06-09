import { describe, expect, it } from "vitest";
import {
	buildMcpProtectedResourceMetadata,
	buildProtectedResourceMetadata,
} from "../agent-readiness";
import {
	getMcpResourceAudience,
	isApiKeyCredential,
	isLikelyJwt,
	MCP_RESOURCE_AUDIENCE_PROD,
	OAUTH_MCP_SCOPES,
} from "../oauth.constants";

describe("oauth.constants", () => {
	it("detects API key credentials", () => {
		expect(isApiKeyCredential("rtn_live_abcd1234secret")).toBe(true);
		expect(isApiKeyCredential("eyJhbGciOiJIUzI1NiJ9.a.b")).toBe(false);
	});

	it("detects JWT shape", () => {
		expect(isLikelyJwt("a.b.c")).toBe(true);
		expect(isLikelyJwt("rtn_live_x")).toBe(false);
	});

	it("builds MCP resource audience from request", () => {
		const req = new Request("https://mcp.ration.mayutic.com/mcp");
		expect(getMcpResourceAudience(req)).toBe(MCP_RESOURCE_AUDIENCE_PROD);
	});
});

describe("buildMcpProtectedResourceMetadata", () => {
	it("advertises authorization server and MCP scopes", () => {
		const req = new Request(
			"https://mcp.ration.mayutic.com/.well-known/oauth-protected-resource",
		);
		const meta = buildMcpProtectedResourceMetadata(
			req,
			"https://ration.mayutic.com/api/auth",
		);
		expect(meta.authorization_servers).toEqual([
			"https://ration.mayutic.com/api/auth",
		]);
		expect(meta.scopes_supported).toEqual([...OAUTH_MCP_SCOPES]);
		expect(meta.resource).toBe("https://mcp.ration.mayutic.com/mcp");
	});
});

describe("buildProtectedResourceMetadata", () => {
	it("REST API metadata still documents API keys", () => {
		const req = new Request(
			"https://ration.mayutic.com/.well-known/oauth-protected-resource",
		);
		const meta = buildProtectedResourceMetadata(req);
		expect(meta.authentication_methods_supported).toContain("api_key");
		expect(meta.authorization_servers).toEqual([]);
	});
});
