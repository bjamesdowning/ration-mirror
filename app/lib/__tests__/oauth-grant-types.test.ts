import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { jwt } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { OAUTH_GRANT_TYPES } from "../oauth.constants";

/**
 * Runs the real Better Auth OAuth provider with Ration's grant-type config to
 * prove DCR and discovery no longer offer client_credentials.
 */
function makeAuth() {
	return betterAuth({
		baseURL: "https://ration.test",
		basePath: "/api/auth",
		secret: "test-secret-test-secret-test-secret-123",
		database: memoryAdapter({}),
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/oauth/sign-in",
				consentPage: "/oauth/consent",
				allowDynamicClientRegistration: true,
				allowUnauthenticatedClientRegistration: true,
				grantTypes: [...OAUTH_GRANT_TYPES],
				silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
			}),
		],
	});
}

function register(auth: ReturnType<typeof makeAuth>, body: object) {
	return auth.handler(
		new Request("https://ration.test/api/auth/oauth2/register", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

describe("OAuth grant types", () => {
	it("excludes client_credentials", () => {
		expect(OAUTH_GRANT_TYPES).toEqual(["authorization_code", "refresh_token"]);
	});

	it("DCR rejects a client_credentials-only registration", async () => {
		const res = await register(makeAuth(), {
			redirect_uris: ["https://client.example/cb"],
			grant_types: ["client_credentials"],
			token_endpoint_auth_method: "client_secret_basic",
		});
		expect(res.status).toBe(400);
	});

	it("DCR never grants client_credentials when requested with other grants", async () => {
		const res = await register(makeAuth(), {
			redirect_uris: ["http://127.0.0.1:3000/cb"],
			grant_types: [
				"authorization_code",
				"refresh_token",
				"client_credentials",
			],
			token_endpoint_auth_method: "none",
			application_type: "native",
		});
		expect(res.status).toBeLessThan(300);
		const json = (await res.json()) as { grant_types: string[] };
		expect(json.grant_types).not.toContain("client_credentials");
		expect(json.grant_types).toEqual(["authorization_code", "refresh_token"]);
	});

	it("discovery metadata does not advertise client_credentials", async () => {
		const auth = makeAuth();
		const res = await auth.handler(
			new Request(
				"https://ration.test/api/auth/.well-known/oauth-authorization-server",
			),
		);
		expect(res.status).toBe(200);
		const json = (await res.json()) as { grant_types_supported: string[] };
		expect(json.grant_types_supported).toEqual([
			"authorization_code",
			"refresh_token",
		]);
	});
});
