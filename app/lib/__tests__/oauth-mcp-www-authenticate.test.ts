import { describe, expect, it } from "vitest";
import {
	buildMcpWwwAuthenticate,
	OAUTH_ACCESS_TOKEN_TTL_SEC,
} from "../oauth.constants";

describe("OAuth MCP auth constants", () => {
	it("uses a 1-hour access token TTL", () => {
		expect(OAUTH_ACCESS_TOKEN_TTL_SEC).toBe(3600);
	});

	it("builds WWW-Authenticate with resource_metadata and error fields", () => {
		const header = buildMcpWwwAuthenticate("https://mcp.example.com", {
			error: "invalid_token",
			errorDescription: "Refresh or reconnect.",
		});
		expect(header).toContain('Bearer realm="Ration MCP"');
		expect(header).toContain(
			'resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"',
		);
		expect(header).toContain('error="invalid_token"');
		expect(header).toContain('error_description="Refresh or reconnect."');
	});
});
