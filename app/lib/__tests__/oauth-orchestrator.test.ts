import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	advanceFlow,
	buildConsentUrl,
	buildSelectOrgUrl,
	createFlow,
	digestOAuthQuery,
	ensureFlowForRequest,
	getFlow,
	isStepAtLeast,
	OAuthFlowError,
	requireFlow,
	verifyOAuthQueryDigestAsync,
} from "../oauth-orchestrator.server";

function makeKv() {
	const store = new Map<string, string>();
	return {
		get: vi.fn(async (key: string) => store.get(key) ?? null),
		put: vi.fn(
			async (key: string, value: string, opts?: { expirationTtl?: number }) => {
				store.set(key, value);
				void opts;
			},
		),
		delete: vi.fn(async (key: string) => {
			store.delete(key);
		}),
		_store: store,
	} as unknown as KVNamespace & { _store: Map<string, string> };
}

const OAUTH_QUERY =
	"client_id=test-client&scope=mcp%3Aread+offline_access&response_type=code&state=abc";

describe("digestOAuthQuery", () => {
	it("returns 64-char hex", async () => {
		const d = await digestOAuthQuery(OAUTH_QUERY);
		expect(d).toHaveLength(64);
		expect(await verifyOAuthQueryDigestAsync(OAUTH_QUERY, d)).toBe(true);
	});
});

describe("createFlow and getFlow", () => {
	let kv: ReturnType<typeof makeKv>;

	beforeEach(() => {
		kv = makeKv();
	});

	it("stores and loads a flow record", async () => {
		const flow = await createFlow(kv, OAUTH_QUERY);
		const loaded = await getFlow(kv, flow.flowId);
		expect(loaded?.clientId).toBe("test-client");
		expect(loaded?.requestedScopes).toContain("mcp:read");
	});

	it("throws when oauth_query is empty", async () => {
		await expect(createFlow(kv, "")).rejects.toMatchObject({
			code: "missing_oauth_query",
		});
	});
});

describe("buildConsentUrl", () => {
	it("never returns a bare consent path", () => {
		const url = buildConsentUrl(
			"00000000-0000-4000-8000-000000000001",
			OAUTH_QUERY,
		);
		expect(url).toContain("oauth_query=");
		expect(url).toContain("flow_id=");
	});
});

describe("buildSelectOrgUrl", () => {
	it("includes post_login and flow_id", () => {
		const url = buildSelectOrgUrl(
			"00000000-0000-4000-8000-000000000001",
			OAUTH_QUERY,
		);
		expect(url).toContain("post_login=true");
		expect(url).toContain("flow_id=");
	});
});

describe("ensureFlowForRequest", () => {
	it("creates a flow when flow_id is absent", async () => {
		const kv = makeKv();
		const url = new URL(
			`https://ration.mayutic.com/oauth/sign-in?oauth_query=${encodeURIComponent(OAUTH_QUERY)}`,
		);
		const { flow } = await ensureFlowForRequest(kv, url);
		expect(flow.step).toBe("initiated");
	});

	it("uses oauth_query from URL when flow_id is present (digest is telemetry-only)", async () => {
		const kv = makeKv();
		const created = await createFlow(kv, OAUTH_QUERY);
		const other = "client_id=other&scope=mcp%3Aread&sig=x";
		const url = new URL(
			`https://ration.mayutic.com/oauth/consent?flow_id=${created.flowId}&oauth_query=${encodeURIComponent(other)}`,
		);
		const { flow, oauthQuery } = await ensureFlowForRequest(kv, url);
		expect(flow.flowId).toBe(created.flowId);
		expect(oauthQuery).toBe(other);
	});
});

describe("requireFlow", () => {
	it("enforces minimum step", async () => {
		const kv = makeKv();
		const flow = await createFlow(kv, OAUTH_QUERY);
		await expect(
			requireFlow(kv, flow.flowId, { minStep: "authenticated" }),
		).rejects.toMatchObject({ code: "flow_step_mismatch" });
	});

	it("rejects another user when minStep requires a bound session", async () => {
		const kv = makeKv();
		const flow = await createFlow(kv, OAUTH_QUERY);
		await advanceFlow(kv, flow.flowId, "authenticated", {
			userId: "user-a",
		});
		await expect(
			requireFlow(kv, flow.flowId, {
				minStep: "authenticated",
				userId: "user-b",
			}),
		).rejects.toMatchObject({ code: "flow_user_mismatch" });
	});

	it("rejects authenticated minStep when userId is not yet bound", async () => {
		const kv = makeKv();
		const flow = await createFlow(kv, OAUTH_QUERY);
		await advanceFlow(kv, flow.flowId, "authenticated");
		await expect(
			requireFlow(kv, flow.flowId, {
				minStep: "authenticated",
				userId: "user-a",
			}),
		).rejects.toMatchObject({ code: "flow_user_mismatch" });
	});
});

describe("isStepAtLeast", () => {
	it("orders steps correctly", () => {
		expect(isStepAtLeast("org_selected", "authenticated")).toBe(true);
		expect(isStepAtLeast("initiated", "consent_presented")).toBe(false);
	});
});
