import { APP_VERSION } from "./version";

export const AGENT_DISCOVERY_LINK_HEADER = [
	'</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
	'</docs/api>; rel="service-doc"; type="text/html"',
	'</api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
	'</.well-known/mcp/server-card.json>; rel="mcp-server-card"; type="application/json"',
	'</.well-known/agent-skills/index.json>; rel="agent-skills"; type="application/json"',
].join(", ");

const SITE_DESCRIPTION =
	"Ration is an AI-native kitchen management system for inventory, meal planning, shopping lists, and MCP agent control.";

export const AGENT_API_SCOPES = [
	"inventory",
	"galley",
	"supply",
	"mcp",
	"mcp:read",
	"mcp:inventory:write",
	"mcp:galley:write",
	"mcp:manifest:write",
	"mcp:supply:write",
	"mcp:preferences:write",
] as const;

export const MCP_TOOL_GROUPS = [
	{
		name: "Inventory",
		tools: [
			"search_ingredients",
			"list_inventory",
			"get_cargo_item",
			"add_cargo_item",
			"update_cargo_item",
			"remove_cargo_item",
			"get_expiring_items",
			"inventory_import_schema",
			"preview_inventory_import",
			"apply_inventory_import",
			"import_inventory_csv",
		],
	},
	{
		name: "Meals",
		tools: [
			"list_meals",
			"match_meals",
			"create_meal",
			"update_meal",
			"delete_meal",
			"toggle_meal_active",
			"clear_active_meals",
			"consume_meal",
		],
	},
	{
		name: "Planning",
		tools: [
			"get_meal_plan",
			"add_meal_plan_entry",
			"bulk_add_meal_plan_entries",
			"update_meal_plan_entry",
			"remove_meal_plan_entry",
		],
	},
	{
		name: "Supply",
		tools: [
			"get_supply_list",
			"add_supply_item",
			"update_supply_item",
			"remove_supply_item",
			"mark_supply_purchased",
			"sync_supply_from_selected_meals",
			"complete_supply_list",
		],
	},
	{
		name: "Account",
		tools: ["get_context", "get_user_preferences", "update_user_preferences"],
	},
] as const;

export const AGENT_SKILLS = [
	{
		name: "Connect Ration MCP",
		slug: "connect-ration-mcp",
		type: "mcp-setup",
		description:
			"Configure an MCP-compatible AI client to connect to the Ration kitchen management server.",
	},
	{
		name: "Search Kitchen Inventory",
		slug: "search-kitchen-inventory",
		type: "tool-use",
		description:
			"Use semantic inventory search to answer what is available in Cargo.",
	},
	{
		name: "Plan Meals From Cargo",
		slug: "plan-meals-from-cargo",
		type: "workflow",
		description:
			"Match meals against pantry inventory and assemble a practical Manifest.",
	},
	{
		name: "Build Supply Lists",
		slug: "build-supply-lists",
		type: "workflow",
		description:
			"Generate shopping lists from planned meals and missing Cargo items.",
	},
	{
		name: "Check Kitchen Status",
		slug: "check-kitchen-status",
		type: "workflow",
		description:
			"Summarize expiring items, planned meals, credit balance, and supply gaps.",
	},
] as const;

function absoluteUrl(request: Request, path: string): string {
	const url = new URL(request.url);
	return new URL(path, url.origin).toString();
}

function mcpOrigin(request: Request): string {
	const url = new URL(request.url);
	const hostname = url.hostname.startsWith("mcp.")
		? url.hostname
		: `mcp.${url.hostname}`;
	return `${url.protocol}//${hostname}`;
}

export function wantsMarkdown(request: Request): boolean {
	const accept = request.headers.get("Accept") ?? "";
	return accept
		.split(",")
		.map((part) => part.trim().toLowerCase())
		.some(
			(part) => part === "text/markdown" || part.startsWith("text/markdown;"),
		);
}

function markdownTokens(markdown: string): string {
	return String(Math.ceil(markdown.length / 4));
}

export function markdownResponse(
	markdown: string,
	init: ResponseInit = {},
): Response {
	const headers = new Headers(init.headers);
	headers.set("Content-Type", "text/markdown; charset=utf-8");
	headers.set("Vary", "Accept");
	headers.set("x-markdown-tokens", markdownTokens(markdown));
	headers.set("Link", AGENT_DISCOVERY_LINK_HEADER);
	return new Response(markdown, { ...init, headers });
}

export function getPublicMarkdownForPath(pathname: string): string | null {
	if (pathname === "/" || pathname === "") return HOME_MARKDOWN;
	if (pathname === "/docs/api") return API_DOCS_MARKDOWN;
	return null;
}

export function getMarkdownResponseForRequest(
	request: Request,
): Response | null {
	if (!wantsMarkdown(request)) return null;
	const markdown = getPublicMarkdownForPath(new URL(request.url).pathname);
	return markdown ? markdownResponse(markdown) : null;
}

export function buildApiCatalog(request: Request) {
	const apiAnchor = absoluteUrl(request, "/api/v1");
	const mcpAnchor = `${mcpOrigin(request)}/mcp`;
	return {
		linkset: [
			{
				anchor: apiAnchor,
				"service-desc": [{ href: absoluteUrl(request, "/api/openapi.json") }],
				"service-doc": [{ href: absoluteUrl(request, "/docs/api") }],
				status: [{ href: absoluteUrl(request, "/api/status") }],
			},
			{
				anchor: mcpAnchor,
				"service-desc": [
					{ href: absoluteUrl(request, "/.well-known/mcp/server-card.json") },
				],
				"service-doc": [{ href: absoluteUrl(request, "/docs/api#mcp-server") }],
				status: [
					{
						href: `${mcpOrigin(request)}/.well-known/oauth-protected-resource`,
					},
				],
			},
		],
	};
}

export function buildOpenApiDocument(request: Request) {
	const origin = new URL(request.url).origin;
	return {
		openapi: "3.1.0",
		info: {
			title: "Ration API",
			version: APP_VERSION,
			description:
				"Programmatic access to Ration inventory, Galley meals, and Supply exports. API keys are scoped per organization.",
		},
		servers: [{ url: origin }],
		components: {
			securitySchemes: {
				apiKey: {
					type: "apiKey",
					in: "header",
					name: "X-Api-Key",
					description:
						"Ration API key. Use scopes: inventory, galley, supply, or mcp.",
				},
			},
		},
		security: [{ apiKey: [] }],
		paths: {
			"/api/v1/inventory/export": {
				get: {
					summary: "Export Cargo inventory as CSV",
					security: [{ apiKey: [] }],
					responses: { "200": { description: "CSV inventory export" } },
				},
			},
			"/api/v1/inventory/import": {
				post: {
					summary: "Import Cargo inventory from CSV",
					security: [{ apiKey: [] }],
					responses: { "200": { description: "Import result" } },
				},
			},
			"/api/v1/galley/export": {
				get: {
					summary: "Export Galley meals as JSON",
					security: [{ apiKey: [] }],
					responses: { "200": { description: "JSON meal export" } },
				},
			},
			"/api/v1/galley/import": {
				post: {
					summary: "Import Galley meals from JSON",
					security: [{ apiKey: [] }],
					responses: { "200": { description: "Import result" } },
				},
			},
			"/api/v1/supply/export": {
				get: {
					summary: "Export active Supply list as CSV",
					security: [{ apiKey: [] }],
					responses: { "200": { description: "CSV supply export" } },
				},
			},
		},
	};
}

export function buildProtectedResourceMetadata(request: Request) {
	const origin = new URL(request.url).origin;
	return {
		resource: origin,
		resource_name: "Ration API",
		authorization_servers: [],
		authentication_methods_supported: ["api_key"],
		api_key_methods_supported: ["x-api-key", "authorization_bearer"],
		scopes_supported: AGENT_API_SCOPES,
		resource_documentation: `${origin}/docs/api`,
		note: "Ration's current programmatic API and MCP server use organization-scoped API keys, not OAuth access tokens.",
	};
}

export function buildMcpServerCard(request: Request) {
	const mcpBase = mcpOrigin(request);
	return {
		schemaVersion: "2025-06-18",
		serverInfo: {
			name: "Ration MCP",
			title: "Ration Kitchen Agent Server",
			version: APP_VERSION,
			description:
				"Control Ration inventory, meals, meal plans, shopping lists, and credits from an MCP-compatible AI client.",
		},
		transport: {
			type: "streamable-http",
			url: `${mcpBase}/mcp`,
			authentication: {
				type: "bearer",
				resourceMetadata: `${mcpBase}/.well-known/oauth-protected-resource`,
			},
		},
		capabilities: {
			tools: MCP_TOOL_GROUPS,
			resources: [],
			prompts: [],
		},
		documentationUrl: absoluteUrl(request, "/docs/api#mcp-server"),
	};
}

export async function buildAgentSkillsIndex(request: Request) {
	const skills = await Promise.all(
		AGENT_SKILLS.map(async (skill) => ({
			name: skill.name,
			type: skill.type,
			description: skill.description,
			url: absoluteUrl(
				request,
				`/.well-known/agent-skills/${skill.slug}/SKILL.md`,
			),
			sha256: await sha256Hex(buildAgentSkillMarkdown(skill.slug)),
		})),
	);
	return {
		$schema: "https://agentskills.io/schemas/skills-index-v0.2.json",
		skills,
	};
}

export function buildAgentSkillMarkdown(slug: string): string {
	const skill = AGENT_SKILLS.find((item) => item.slug === slug);
	if (!skill) return "";
	const toolList = MCP_TOOL_GROUPS.flatMap((group) => group.tools).join(", ");
	return `# ${skill.name}

${skill.description}

## When To Use

Use this skill when an AI agent needs to work with a user's Ration kitchen data through the MCP server or documented REST API.

## Connection

- App: https://ration.mayutic.com
- MCP endpoint: https://mcp.ration.mayutic.com/mcp
- Auth: Ration API key with the required scope

## Relevant Tools

${toolList}

## Safety

Only perform mutating actions when the user has clearly requested the change. Never expose API keys, session cookies, or private household data in logs or messages.
`;
}

async function sha256Hex(value: string): Promise<string> {
	const data = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

export const HOME_MARKDOWN = `# Ration

${SITE_DESCRIPTION}

Ration lets you manage an entire kitchen through an AI agent. Connect Claude, Cursor, or any MCP-compatible client to search Cargo, match meals, plan a Manifest, generate Supply lists, and update inventory with user-authorized tools.

## Core Loop

1. Cargo: pantry inventory with tags, expiry tracking, and semantic search.
2. Galley: meals and provisions matched against what is in stock.
3. Manifest: weekly meal planning with breakfast, lunch, dinner, and snack slots.
4. Supply: shopping lists generated from missing ingredients.
5. Dock: purchased items flow back into Cargo.

## Agent-Ready Surfaces

- MCP server: https://mcp.ration.mayutic.com/mcp
- API catalog: /.well-known/api-catalog
- MCP server card: /.well-known/mcp/server-card.json
- Agent skills: /.well-known/agent-skills/index.json
- API docs: /docs/api

## Pricing

Ration has a Free tier with lifecycle access and a Crew Member plan for unlimited capacity, household groups, member invites, credit transfers, and yearly credits. AI features use credits on both tiers.
`;

export const API_DOCS_MARKDOWN = `# Ration API and Agent Documentation

Ration exposes kitchen data to agents through two surfaces: a REST API for import/export workflows and an MCP server for conversational kitchen operations.

## REST API

The v1 API uses organization-scoped API keys. Send keys with \`X-Api-Key\` or \`Authorization: Bearer <key>\`.

- \`GET /api/v1/inventory/export\`: export Cargo inventory as CSV.
- \`POST /api/v1/inventory/import\`: import Cargo inventory from CSV.
- \`GET /api/v1/galley/export\`: export Galley meals as JSON.
- \`POST /api/v1/galley/import\`: import Galley meals as JSON.
- \`GET /api/v1/supply/export\`: export the active Supply list as CSV.

## MCP Server

Endpoint: \`https://mcp.ration.mayutic.com/mcp\`

Use an API key with the \`mcp\` scope. The MCP server exposes tools for inventory search, meal matching, meal planning, supply list management, cooking/consumption deduction, and credit checks.

## Discovery

- API catalog: \`/.well-known/api-catalog\`
- OpenAPI description: \`/api/openapi.json\`
- API-key protected resource metadata: \`/.well-known/oauth-protected-resource\`
- MCP server card: \`/.well-known/mcp/server-card.json\`
- Agent skills index: \`/.well-known/agent-skills/index.json\`
`;
