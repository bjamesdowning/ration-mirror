import { describe, expect, it } from "vitest";
import {
	OAUTH_ADVERTISED_MCP_SCOPES,
	OAUTH_ADVERTISED_SCOPES,
	OAUTH_CONSENT_DEFAULT_CHECKED_SCOPES,
	OAUTH_DCR_MCP_SCOPES,
	OAUTH_MCP_SCOPES,
	OAUTH_PROVIDER_SCOPES,
	OAUTH_REGISTRATION_DEFAULT_SCOPES,
	OAUTH_REGISTRATION_SCOPES,
} from "../../oauth.constants";

describe("oauth.constants scope policy", () => {
	it("excludes mcp:delegate from open DCR scopes", () => {
		expect(OAUTH_REGISTRATION_SCOPES).not.toContain("mcp:delegate");
		expect(OAUTH_DCR_MCP_SCOPES).not.toContain("mcp:delegate");
	});

	it("excludes mcp:delegate from public discovery scopes", () => {
		expect(OAUTH_ADVERTISED_MCP_SCOPES).not.toContain("mcp:delegate");
		expect(OAUTH_ADVERTISED_SCOPES).not.toContain("mcp:delegate");
	});

	it("keeps advertised scopes within DCR-allowed vocabulary", () => {
		for (const scope of OAUTH_ADVERTISED_SCOPES) {
			expect(OAUTH_REGISTRATION_SCOPES).toContain(scope);
		}
		for (const scope of OAUTH_ADVERTISED_MCP_SCOPES) {
			expect(OAUTH_DCR_MCP_SCOPES).toContain(scope);
		}
	});

	it("includes mcp:delegate in full provider vocabulary", () => {
		expect(OAUTH_PROVIDER_SCOPES).toContain("mcp:delegate");
	});

	it("defaults DCR clients to all granular MCP scopes except delegate", () => {
		for (const scope of OAUTH_DCR_MCP_SCOPES) {
			expect(OAUTH_REGISTRATION_DEFAULT_SCOPES).toContain(scope);
		}
		expect(OAUTH_REGISTRATION_DEFAULT_SCOPES).toContain("offline_access");
	});

	it("pre-checks only read on consent", () => {
		expect(OAUTH_CONSENT_DEFAULT_CHECKED_SCOPES).toEqual(["mcp:read"]);
		expect(OAUTH_MCP_SCOPES.length).toBeGreaterThan(1);
	});
});
