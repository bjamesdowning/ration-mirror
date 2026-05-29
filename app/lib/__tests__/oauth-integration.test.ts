import { describe, expect, it } from "vitest";
import fixtures from "../../test/fixtures/oauth/better-auth-redirects.json";
import { buildConsentScopeForSubmit } from "../oauth-flow";
import {
	buildConsentUrl,
	createFlow,
	digestOAuthQuery,
} from "../oauth-orchestrator.server";
import { getSafeAuthRedirectUrl } from "../oauth-redirect.server";

const OAUTH_QUERY =
	"client_id=integration-client&scope=mcp%3Aread+offline_access&response_type=code&state=s1";

function makeKv() {
	const store = new Map<string, string>();
	return {
		get: async (key: string) => store.get(key) ?? null,
		put: async (key: string, value: string) => {
			store.set(key, value);
		},
		delete: async (key: string) => {
			store.delete(key);
		},
	} as unknown as KVNamespace;
}

describe("OAuth integration path", () => {
	it("happy path: flow creation → consent scope → redirect URL", async () => {
		const kv = makeKv();
		const flow = await createFlow(kv, OAUTH_QUERY);
		const scope = buildConsentScopeForSubmit(["mcp:read"], OAUTH_QUERY);
		expect(scope).toBe("mcp:read offline_access");

		const consentUrl = buildConsentUrl(flow.flowId, OAUTH_QUERY);
		expect(consentUrl).toContain(flow.flowId);

		const digest = await digestOAuthQuery(OAUTH_QUERY);
		expect(flow.oauthQueryDigest).toBe(digest);

		const callback = getSafeAuthRedirectUrl(fixtures.oauth2Consent_success);
		expect(callback).toMatch(/^cursor:/);
	});
});
