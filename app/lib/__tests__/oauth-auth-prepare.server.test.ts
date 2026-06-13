import { describe, expect, it } from "vitest";
import { MCP_RESOURCE_AUDIENCE_PROD } from "../oauth.constants";
import {
	shouldDefaultMcpResource,
	withDefaultMcpResourceOnTokenExchange,
} from "../oauth-auth-prepare.server";

const env = {
	BETTER_AUTH_URL: "https://ration.mayutic.com",
} as Cloudflare.Env;

describe("shouldDefaultMcpResource", () => {
	it("defaults resource for authorization_code and refresh_token grants", () => {
		expect(shouldDefaultMcpResource("authorization_code")).toBe(true);
		expect(shouldDefaultMcpResource("refresh_token")).toBe(true);
	});

	it("does not default resource for client_credentials", () => {
		expect(shouldDefaultMcpResource("client_credentials")).toBe(false);
	});
});

describe("withDefaultMcpResourceOnTokenExchange", () => {
	it("injects MCP resource for JSON token exchanges missing resource", async () => {
		const request = new Request(
			"https://ration.mayutic.com/api/auth/oauth2/token",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					grant_type: "authorization_code",
					code: "abc",
				}),
			},
		);

		const prepared = await withDefaultMcpResourceOnTokenExchange(request, env);
		const body = (await prepared.json()) as { resource?: string };

		expect(body.resource).toBe(MCP_RESOURCE_AUDIENCE_PROD);
	});

	it("injects MCP resource for form-encoded token exchanges missing resource", async () => {
		const request = new Request(
			"https://ration.mayutic.com/api/auth/oauth2/token",
			{
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: "rt",
				}).toString(),
			},
		);

		const prepared = await withDefaultMcpResourceOnTokenExchange(request, env);
		const text = await prepared.text();
		const params = new URLSearchParams(text);

		expect(params.get("resource")).toBe(MCP_RESOURCE_AUDIENCE_PROD);
	});

	it("preserves an explicit resource parameter", async () => {
		const explicit = "https://mcp.ration.mayutic.com/mcp";
		const request = new Request(
			"https://ration.mayutic.com/api/auth/oauth2/token",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					grant_type: "authorization_code",
					resource: explicit,
					code: "abc",
				}),
			},
		);

		const prepared = await withDefaultMcpResourceOnTokenExchange(request, env);
		const body = (await prepared.json()) as { resource?: string };

		expect(body.resource).toBe(explicit);
	});

	it("leaves non-token requests unchanged", async () => {
		const request = new Request(
			"https://ration.mayutic.com/api/auth/oauth2/authorize",
			{
				method: "GET",
			},
		);

		const prepared = await withDefaultMcpResourceOnTokenExchange(request, env);
		expect(prepared).toBe(request);
	});
});
