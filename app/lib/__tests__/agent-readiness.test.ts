import { describe, expect, it, vi } from "vitest";

// Mock cloudflare:workers used by api-key.server (transitively imported below).
vi.mock("cloudflare:workers", () => ({ waitUntil: vi.fn() }));

import {
	AGENT_API_SCOPES,
	AGENT_DISCOVERY_LINK_HEADER,
	buildAgentSkillMarkdown,
	buildAgentSkillsIndex,
	buildApiCatalog,
	buildMcpServerCard,
	buildProtectedResourceMetadata,
	getPublicMarkdownForPath,
	MCP_TOOL_GROUPS,
	markdownResponse,
	wantsMarkdown,
} from "../agent-readiness";
import { API_SCOPES } from "../api-key.server";
import { buildOpenApiDocument } from "../openapi-document.server";

const request = new Request("https://ration.mayutic.com/");

describe("agent readiness metadata", () => {
	it("publishes RFC 8288 discovery links", () => {
		expect(AGENT_DISCOVERY_LINK_HEADER).toContain("/.well-known/api-catalog");
		expect(AGENT_DISCOVERY_LINK_HEADER).toContain('rel="service-doc"');
		expect(AGENT_DISCOVERY_LINK_HEADER).toContain(
			"/.well-known/mcp/server-card.json",
		);
		expect(AGENT_DISCOVERY_LINK_HEADER).not.toContain(
			"oauth-authorization-server",
		);
	});

	it("detects markdown negotiation and returns markdown responses", async () => {
		expect(
			wantsMarkdown(
				new Request("https://ration.mayutic.com/", {
					headers: { Accept: "text/markdown, text/html;q=0.8" },
				}),
			),
		).toBe(true);

		const response = markdownResponse("# Ration");
		expect(response.headers.get("Content-Type")).toContain("text/markdown");
		expect(response.headers.get("x-markdown-tokens")).toBe("2");
		expect(await response.text()).toBe("# Ration");
	});

	it("provides markdown for key public pages", () => {
		expect(getPublicMarkdownForPath("/")).toContain("manage an entire kitchen");
		expect(getPublicMarkdownForPath("/docs/api")).toContain("Ration API");
		expect(getPublicMarkdownForPath("/legal/privacy")).toBeNull();
	});

	it("builds an API catalog with service descriptors and docs", () => {
		const catalog = buildApiCatalog(request);
		expect(catalog.linkset).toHaveLength(2);
		expect(catalog.linkset[0]["service-desc"][0].href).toBe(
			"https://ration.mayutic.com/api/openapi.json",
		);
		expect(catalog.linkset[0]["service-doc"][0].href).toBe(
			"https://ration.mayutic.com/docs/api",
		);
		expect(catalog.linkset[0].status[0].href).toBe(
			"https://ration.mayutic.com/api/status",
		);
	});

	it("builds RFC 9727 linkset entries with anchor, service-desc, service-doc, and status", () => {
		const catalog = buildApiCatalog(request);
		expect(Array.isArray(catalog.linkset)).toBe(true);
		const absUrl = /^https:\/\/.+\//;
		for (const entry of catalog.linkset) {
			expect(typeof entry.anchor).toBe("string");
			expect(entry.anchor).toMatch(/^https:\/\//);
			expect(entry["service-desc"]?.[0]?.href).toMatch(absUrl);
			expect(entry["service-doc"]?.[0]?.href).toMatch(absUrl);
			expect(entry.status?.[0]?.href).toMatch(absUrl);
		}
		expect(catalog.linkset[0].anchor).toBe("https://ration.mayutic.com/api/v1");
		expect(catalog.linkset[1].anchor).toBe(
			"https://mcp.ration.mayutic.com/mcp",
		);
	});

	it("builds OpenAPI and protected resource metadata", () => {
		const openApi = buildOpenApiDocument(request);
		expect(openApi.openapi).toBe("3.1.0");
		expect(openApi.paths["/api/v1/inventory/export"].get.summary).toContain(
			"Export Cargo",
		);
		expect(openApi.paths["/api/agent/auth"].post.summary).toContain(
			"Anonymous agent registration",
		);
		expect(openApi.components.schemas.AgentAnonRegisterRequest).toBeDefined();
		expect(openApi.components.schemas.GalleyManifest).toBeDefined();

		const resource = buildProtectedResourceMetadata(request, {
			BETTER_AUTH_URL: "https://ration.mayutic.com",
		} as Cloudflare.Env);
		expect(resource.resource).toBe("https://ration.mayutic.com");
		expect(resource.scopes_supported).toContain("mcp");
		expect(resource.authorization_servers).toEqual([
			"https://ration.mayutic.com/api/auth",
		]);
		expect(resource.bearer_methods_supported).toEqual(["header"]);
		expect(resource.authentication_methods_supported).toContain("api_key");
	});

	it("builds an MCP server card from real tool groups", () => {
		const card = buildMcpServerCard(request);
		expect(card.transport.url).toBe("https://mcp.ration.mayutic.com/mcp");
		expect(card.capabilities.tools[0].tools).toContain("search_ingredients");
		expect(card.capabilities.tools[3].tools).toContain(
			"sync_supply_from_selected_meals",
		);
	});

	it("AGENT_API_SCOPES is in sync with API_SCOPES (no drift)", () => {
		// Every advertised scope must exist in the canonical scope list.
		for (const scope of AGENT_API_SCOPES) {
			expect(Object.values(API_SCOPES)).toContain(scope);
		}
		// And every API scope must be advertised in discovery (so agents
		// requesting a key via UI can pick the right one).
		for (const scope of Object.values(API_SCOPES)) {
			expect(AGENT_API_SCOPES).toContain(scope);
		}
	});

	it("MCP_TOOL_GROUPS lists every tool exactly once", () => {
		const seen = new Set<string>();
		const dupes: string[] = [];
		for (const group of MCP_TOOL_GROUPS) {
			for (const tool of group.tools) {
				if (seen.has(tool)) dupes.push(tool);
				seen.add(tool);
			}
		}
		expect(dupes).toEqual([]);
	});

	it("MCP_TOOL_GROUPS does not advertise the no-credit-banned tools", () => {
		const allTools = MCP_TOOL_GROUPS.flatMap((g) => [...g.tools]);
		expect(allTools).not.toContain("get_credit_balance");
		expect(allTools).not.toContain("scan_receipt");
		expect(allTools).not.toContain("generate_meals");
	});

	it("publishes agent skills with matching sha256 digests", async () => {
		const index = await buildAgentSkillsIndex(request);
		expect(index.skills.length).toBeGreaterThan(0);
		expect(index.skills[0].url).toContain(
			"/.well-known/agent-skills/connect-ration-mcp/SKILL.md",
		);
		expect(index.skills[0].sha256).toMatch(/^[a-f0-9]{64}$/);
		expect(buildAgentSkillMarkdown("connect-ration-mcp")).toContain(
			"Ration MCP",
		);
	});

	it("positions OAuth before API keys in agent-facing markdown", () => {
		const skill = buildAgentSkillMarkdown("connect-ration-mcp");
		const home = getPublicMarkdownForPath("/");
		const apiDocsRaw = getPublicMarkdownForPath("/docs/api");
		expect(apiDocsRaw).not.toBeNull();
		const apiDocs = apiDocsRaw as string;

		expect(skill).toContain("OAuth");
		expect(home).toContain("OAuth");
		expect(apiDocs).toContain("OAuth");

		const skillOAuthIdx = skill.indexOf("OAuth");
		const skillKeyIdx = skill.indexOf("API key");
		expect(skillOAuthIdx).toBeGreaterThan(-1);
		expect(skillKeyIdx).toBeGreaterThan(skillOAuthIdx);

		expect(home).toContain("Connect Your Agent");
		expect(home).toMatch(/mcp\.ration\.mayutic\.com\/mcp/);

		const mcpSection = apiDocs.slice(apiDocs.indexOf("## MCP Server"));
		const mcpOAuthIdx = mcpSection.indexOf("OAuth");
		const mcpKeyIdx = mcpSection.indexOf("Organization API keys");
		expect(mcpOAuthIdx).toBeGreaterThan(-1);
		expect(mcpKeyIdx).toBeGreaterThan(mcpOAuthIdx);
	});
});
