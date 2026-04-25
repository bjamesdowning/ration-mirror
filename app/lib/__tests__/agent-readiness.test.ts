import { describe, expect, it } from "vitest";
import {
	AGENT_DISCOVERY_LINK_HEADER,
	buildAgentSkillMarkdown,
	buildAgentSkillsIndex,
	buildApiCatalog,
	buildMcpServerCard,
	buildOpenApiDocument,
	buildProtectedResourceMetadata,
	getPublicMarkdownForPath,
	markdownResponse,
	wantsMarkdown,
} from "../agent-readiness";

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

		const resource = buildProtectedResourceMetadata(request);
		expect(resource.resource).toBe("https://ration.mayutic.com");
		expect(resource.scopes_supported).toContain("mcp");
		expect(resource.authorization_servers).toEqual([]);
		expect(resource.authentication_methods_supported).toEqual(["api_key"]);
	});

	it("builds an MCP server card from real tool groups", () => {
		const card = buildMcpServerCard(request);
		expect(card.transport.url).toBe("https://mcp.ration.mayutic.com/mcp");
		expect(card.capabilities.tools[0].tools).toContain("search_ingredients");
		expect(card.capabilities.tools[3].tools).toContain(
			"sync_supply_from_selected_meals",
		);
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
});
