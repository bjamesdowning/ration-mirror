import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ waitUntil: vi.fn() }));

import {
	buildGetContextCapabilities,
	buildSuggestedNextActions,
} from "../agent/onboarding.server";
import {
	buildAgentAuthMetadata,
	buildAuthMarkdown,
	buildMcpProtectedResourceMetadata,
	buildProtectedResourceMetadata,
} from "../agent-readiness";
import {
	buildClaudeDeepLink,
	buildCursorDeepLink,
	buildMcpDeepLink,
} from "../mcp/deep-links";
import { resolveAuthorizationServerIssuer } from "../oauth.constants";

const env = {
	BETTER_AUTH_URL: "https://ration.mayutic.com",
} as Cloudflare.Env;

const request = new Request("https://ration.mayutic.com/");

describe("agent onboarding discovery", () => {
	it("issuer is byte-identical across app PRM, agent_auth, and MCP PRM", () => {
		const issuer = resolveAuthorizationServerIssuer(env);
		const appPrm = buildProtectedResourceMetadata(request, env);
		const agentAuth = buildAgentAuthMetadata(request, env);
		const mcpPrm = buildMcpProtectedResourceMetadata(
			new Request(
				"https://mcp.ration.mayutic.com/.well-known/oauth-protected-resource",
			),
			issuer,
		);

		expect(appPrm.authorization_servers).toEqual([issuer]);
		expect(agentAuth.issuer).toBe(issuer);
		expect(mcpPrm.authorization_servers).toEqual([issuer]);
	});

	it("agent_auth matches isitagentready auth.md schema", () => {
		const agentAuth = buildAgentAuthMetadata(request, env);
		expect(agentAuth.skill).toBe("https://ration.mayutic.com/auth.md");
		expect(agentAuth.register_uri).toBe(
			"https://ration.mayutic.com/api/agent/auth",
		);
		expect(agentAuth.claim_uri).toBe(
			"https://ration.mayutic.com/api/agent/auth/claim",
		);
		expect(agentAuth.reissue_uri).toBe(
			"https://ration.mayutic.com/api/agent/auth/claim/reissue",
		);
		expect(agentAuth.identity_types_supported).toEqual(["anonymous"]);
		expect(agentAuth.anonymous.credential_types_supported).toEqual(["api_key"]);
		expect(JSON.stringify(agentAuth)).not.toContain("id-jag");
		expect(JSON.stringify(agentAuth)).not.toContain("identity_assertion");
	});

	it("auth.md documents full-write Tier 0 and retention", () => {
		const md = buildAuthMarkdown(request, env);
		expect(md.startsWith("# Ration auth.md")).toBe(true);
		expect(md.toLowerCase()).toContain("auth.md");
		expect(md).toContain("Registration metadata");
		expect(md).toContain("Tier 0");
		expect(md).toContain("Tier 1");
		expect(md).toContain("/api/agent/auth");
		expect(md).toContain("claim/reissue");
		expect(md).toContain("Time limits & retention");
		expect(md).toContain("full MCP write");
		expect(md).not.toContain("id-jag");
		expect(md).not.toContain("identity_assertion");
	});

	it("app PRM includes bearer_methods_supported and auth.md link", () => {
		const prm = buildProtectedResourceMetadata(request, env);
		expect(prm.bearer_methods_supported).toEqual(["header"]);
		expect(prm.agent_auth).toBe("https://ration.mayutic.com/auth.md");
	});

	it("public discovery metadata excludes Fin-only mcp:delegate", () => {
		const appPrm = buildProtectedResourceMetadata(request, env);
		const mcpPrm = buildMcpProtectedResourceMetadata(
			new Request(
				"https://mcp.ration.mayutic.com/.well-known/oauth-protected-resource",
			),
			resolveAuthorizationServerIssuer(env),
		);
		expect(appPrm.scopes_supported).not.toContain("mcp:delegate");
		expect(mcpPrm.scopes_supported).not.toContain("mcp:delegate");
	});
});

describe("MCP deep links", () => {
	it("builds client-specific install URLs", () => {
		expect(buildCursorDeepLink()).toContain("cursor://");
		expect(buildClaudeDeepLink()).toContain("claude://");
		expect(buildMcpDeepLink("chatgpt")).toContain("chatgpt://");
	});
});

describe("get_context onboarding helpers", () => {
	it("suggests reissue when preClaim", () => {
		const onboarding = {
			claimed: false,
			status: "pending_claim" as const,
			claimPage: "https://ration.mayutic.com/connect/claim",
			reissueClaimUri:
				"https://ration.mayutic.com/api/agent/auth/claim/reissue",
			claimUrlAvailable: false,
			preClaim: true,
		};
		const capabilities = buildGetContextCapabilities(["mcp:read"]);
		const actions = buildSuggestedNextActions(onboarding, capabilities);
		expect(actions[0]?.action).toBe("claim_kitchen");
		expect(actions.some((a) => a.action === "reissue_claim_url")).toBe(true);
	});

	it("suggests write tools when claimed", () => {
		const onboarding = {
			claimed: true,
			status: "claimed" as const,
			claimUrlAvailable: false,
			preClaim: false,
		};
		const capabilities = buildGetContextCapabilities([
			"mcp:read",
			"mcp:inventory:write",
		]);
		const actions = buildSuggestedNextActions(onboarding, capabilities);
		expect(actions.some((a) => a.action === "add_cargo_item")).toBe(true);
	});
});

describe("buildPersonalOrgRecords parity (signup hook regression guard)", () => {
	it("produces exactly one personal org per user with owner role", async () => {
		const { buildPersonalOrgRecords } = await import(
			"../agent/org-records.server"
		);
		const userId = "crew-member-user-id";
		const { orgId, orgValues, memberValues } = buildPersonalOrgRecords(
			userId,
			"Crew Member",
		);

		expect(orgValues.slug).toBe(`personal-${userId}`);
		expect(orgValues.metadata).toEqual({ isPersonal: true });
		expect(memberValues.role).toBe("owner");
		expect(memberValues.organizationId).toBe(orgId);
		expect(memberValues.userId).toBe(userId);
	});
});
