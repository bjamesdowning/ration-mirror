import {
	AGENT_CLAIM_REISSUE_PATH,
	AGENT_ORPHAN_INACTIVITY_MS,
	CLAIM_OTP_MAX_ATTEMPTS,
	CLAIM_OTP_TTL_SEC,
	CLAIM_TOKEN_SLIDE_MS,
} from "./agent/claim.constants";
import { AGENT_API_KEY_SCOPES } from "./agent/scopes";
import { formatMcpConnectMarkdown, MCP_ENDPOINT_URL } from "./mcp/connect-copy";
import {
	OAUTH_ADVERTISED_MCP_SCOPES,
	resolveAuthorizationServerIssuer,
	resolveMcpResourceAudience,
} from "./oauth.constants";
import { APP_VERSION } from "./version";

export const AGENT_DISCOVERY_LINK_HEADER = [
	'</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
	'</docs/api>; rel="service-doc"; type="text/html"',
	'</api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
	'</.well-known/mcp/server-card.json>; rel="mcp-server-card"; type="application/json"',
	'</.well-known/agent-skills/index.json>; rel="agent-skills"; type="application/json"',
	'</auth.md>; rel="agent-auth"; type="text/markdown"',
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

export function buildProtectedResourceMetadata(
	request: Request,
	env?: Cloudflare.Env,
) {
	const origin = new URL(request.url).origin;
	const authEnv = env ?? ({ BETTER_AUTH_URL: origin } as Cloudflare.Env);
	const issuer = resolveAuthorizationServerIssuer(authEnv);
	const mcpAudience = resolveMcpResourceAudience(authEnv);

	return {
		resource: origin,
		resource_name: "Ration API",
		authorization_servers: [issuer],
		bearer_methods_supported: ["header"],
		authentication_methods_supported: ["api_key", "oauth2"],
		api_key_methods_supported: ["x-api-key", "authorization_bearer"],
		scopes_supported: [...AGENT_API_SCOPES, ...OAUTH_ADVERTISED_MCP_SCOPES],
		resource_documentation: `${origin}/docs/api`,
		agent_auth: `${origin}/auth.md`,
		mcp_resource: mcpAudience,
		note: "Ration REST API v1 uses organization-scoped API keys. MCP supports OAuth delegated access — see MCP protected resource metadata on the MCP host.",
	};
}

/** WorkOS / isitagentready auth.md-compatible agent_auth block — advertises only implemented flows. */
export function buildAgentAuthMetadata(request: Request, env?: Cloudflare.Env) {
	const origin = new URL(request.url).origin;
	const authEnv = env ?? ({ BETTER_AUTH_URL: origin } as Cloudflare.Env);
	const issuer = resolveAuthorizationServerIssuer(authEnv);

	return {
		skill: `${origin}/auth.md`,
		register_uri: `${origin}/api/agent/auth`,
		claim_uri: `${origin}/api/agent/auth/claim`,
		reissue_uri: `${origin}${AGENT_CLAIM_REISSUE_PATH}`,
		identity_types_supported: ["anonymous"],
		anonymous: {
			credential_types_supported: ["api_key"],
		},
		issuer,
		protected_resource_metadata: `${origin}/.well-known/oauth-protected-resource`,
		mcp_resource: resolveMcpResourceAudience(authEnv),
	};
}

/** Markdown auth discovery document served at /auth.md. */
export function buildAuthMarkdown(
	request: Request,
	env?: Cloudflare.Env,
): string {
	const origin = new URL(request.url).origin;
	const meta = buildAgentAuthMetadata(request, env);
	const claimCompleteUri = `${origin}/api/agent/auth/claim/complete`;
	const claimPage = `${origin}/connect/claim`;
	const reissueUri = `${origin}${AGENT_CLAIM_REISSUE_PATH}`;
	const scopesList = AGENT_API_KEY_SCOPES.join(", ");
	const slideDays = Math.round(CLAIM_TOKEN_SLIDE_MS / (24 * 60 * 60 * 1000));
	const orphanDays = Math.round(
		AGENT_ORPHAN_INACTIVITY_MS / (24 * 60 * 60 * 1000),
	);

	return `# Ration auth.md

Ration supports agent-first onboarding for MCP and REST API access. Human signup via Better Auth (Google + magic link) remains the primary path for browser users.

## Registration metadata

- Skill: \`${meta.skill}\`
- Register: \`${meta.register_uri}\` (POST; credential type: \`api_key\`)
- Claim: \`${meta.claim_uri}\`
- Reissue claim link: \`${reissueUri}\` (POST; Bearer agent API key)

## Issuer

\`${meta.issuer}\`

## Flows

### Tier 0 — Anonymous self-registration

Agents can provision a kitchen without human signup:

\`\`\`http
POST ${meta.register_uri}
Content-Type: application/json

{ "type": "anonymous", "client_hint": "cursor" }
\`\`\`

Returns (once): \`api_key\`, \`claim_token\`, \`claim_url\`, \`organization_id\`, \`mcp_endpoint\`, and \`scopes\` (${scopesList}).

Tier 0 keys have **full MCP write scopes** immediately. Claiming transfers ownership to a verified human — it does **not** widen scopes or unlock tier capacity.

### Tier 1 — User-claimed / verified email

Humans claim an agent kitchen via OTP email and Terms of Service acceptance:

1. \`POST ${meta.claim_uri}\` — send OTP to email
2. \`POST ${claimCompleteUri}\` — verify OTP, accept ToS (\`tos_accepted: true\`, \`tos_version\`), complete claim

Claim page: ${claimPage}

Scopes after claim: ${scopesList} (unchanged from Tier 0).

### Claim recovery

Users must always be able to claim an active unclaimed kitchen:

- **Option B (passive):** Each API/MCP authentication slides \`claimTokenExpiresAt\` forward by ${slideDays} days while \`pending_claim\`.
- **Option A (active):** \`POST ${reissueUri}\` with \`Authorization: Bearer <agent-api-key>\` returns a new \`claim_token\` and \`claim_url\` (invalidates the prior token).

If both the API key and claim URL are lost, recovery requires support contact.

## Time limits & retention

| Policy | Duration | Applies to |
|--------|----------|------------|
| Initial claim token validity | ${slideDays} days from registration | \`pending_claim\` only |
| Claim token slide (Option B) | Resets to ${slideDays} days from last auth | \`pending_claim\` only |
| Claim reissue (Option A) | Bearer agent API key; 3/hour per key | \`pending_claim\` only |
| Claim OTP validity | ${CLAIM_OTP_TTL_SEC / 60} minutes | Per OTP send |
| Claim OTP max attempts | ${CLAIM_OTP_MAX_ATTEMPTS} per OTP | Per registration |
| Orphan kitchen deletion | ${orphanDays} days idle (last auth or \`createdAt\`) | \`pending_claim\` only |
| Pre-claim MCP write rate limit | 10/min org + per key | \`preClaim: true\` |
| Agent registration rate limit | 5/min per IP | Registration |

Claimed kitchens are never purged by the orphan job.

## OAuth (recommended for interactive MCP clients)

Paste \`${MCP_ENDPOINT_URL}\` into a compatible client and complete browser OAuth sign-in.

- Authorization server metadata: \`${origin}/.well-known/oauth-authorization-server\`
- MCP protected resource: \`${meta.mcp_resource}\` (see MCP host PRM)
- REST protected resource: \`${meta.protected_resource_metadata}\`

## Discovery

- API catalog: \`${origin}/.well-known/api-catalog\`
- MCP server card: \`${origin}/.well-known/mcp/server-card.json\`
- Agent skills: \`${origin}/.well-known/agent-skills/index.json\`
- API docs: \`${origin}/docs/api\`
`;
}

/** RFC 9728 metadata for the MCP resource server (mcp.* domain). */
export function buildMcpProtectedResourceMetadata(
	request: Request,
	authorizationServerIssuer?: string,
) {
	const url = new URL(request.url);
	const mcpOrigin = url.hostname.startsWith("mcp.")
		? url.origin
		: `${url.protocol}//mcp.${url.hostname}`;
	const issuer =
		authorizationServerIssuer ??
		resolveAuthorizationServerIssuer({
			BETTER_AUTH_URL: `${url.protocol}//${url.hostname.replace(/^mcp\./, "")}`,
		} as Cloudflare.Env);

	return {
		resource: `${mcpOrigin}/mcp`,
		resource_name: "Ration MCP",
		authorization_servers: [issuer],
		bearer_methods_supported: ["header"],
		scopes_supported: [...OAUTH_ADVERTISED_MCP_SCOPES],
		resource_documentation: `${url.protocol}//${url.hostname.replace(/^mcp\./, "")}/docs/api#mcp-server`,
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
				type: "oauth2",
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
- MCP endpoint: ${MCP_ENDPOINT_URL}
- Auth (recommended): OAuth 2.1 — paste the MCP URL into a compatible client, complete browser sign-in, select household, and approve scopes. Revoke grants in Hub → Settings → Connected Agents.
- Auth (advanced): Organization API key with \`mcp:*\` scopes for manual header auth or REST v1.

## Connect Steps

${formatMcpConnectMarkdown()}

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

Ration lets you manage an entire kitchen through an AI agent. Paste the MCP URL into Claude, Cursor, or any compatible client — OAuth browser sign-in grants scoped access to search Cargo, match meals, plan a Manifest, generate Supply lists, and update inventory.

## Connect Your Agent

${formatMcpConnectMarkdown()}

The MCP server card advertises \`oauth2\` transport auth at \`/.well-known/mcp/server-card.json\`.

## Core Loop

1. Cargo: pantry inventory with tags, expiry tracking, and semantic search.
2. Galley: meals and provisions matched against what is in stock.
3. Manifest: weekly meal planning with breakfast, lunch, dinner, and snack slots.
4. Supply: shopping lists generated from missing ingredients.
5. Dock: purchased items flow back into Cargo.

## Agent-Ready Surfaces

- MCP server: ${MCP_ENDPOINT_URL} (OAuth 2.1 primary)
- Agent auth discovery: /auth.md
- Connect landing: /connect
- API catalog: /.well-known/api-catalog
- MCP server card: /.well-known/mcp/server-card.json
- Agent skills: /.well-known/agent-skills/index.json
- API docs: /docs/api

## Pricing

Ration has a Free tier with lifecycle access and a Crew Member plan for unlimited capacity, household groups, member invites, credit transfers, and yearly credits. AI features use credits on both tiers.
`;

export const ABOUT_MARKDOWN = `# About Ration

Ration is built by Billy Downing at Mayutic — an independent product studio focused on AI-native consumer software.

## Mission

Eliminate the everyday cognitive overhead of running a kitchen — what is in stock, what to cook, what to buy — by making the entire workflow operable by an AI agent that has real, current context about your pantry.

## Principles

- **Agent-first.** Every feature ships with an MCP equivalent and an API endpoint.
- **Edge-native.** Inventory and meal data sit at the edge so AI grounding requests are fast.
- **Browser-native.** Use Ration on desktop or mobile from any modern browser — no app store install required.
- **Privacy by default.** Your kitchen data is yours. No selling, no cross-user leaks, and exportable any time.

## Founder

Billy Downing started Ration because pantry trackers assumed humans would do the boring work. MCP and LLMs make it cheap to push that work to the agent; Ration is the structured substrate underneath — D1 inventory, Vectorize semantic search, Workers AI ingestion, and a clean MCP server any compatible client can drive.

Contact: https://www.mayutic.com
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

Endpoint: \`${MCP_ENDPOINT_URL}\`

**Recommended:** OAuth 2.1 delegated access. Paste the URL into an MCP client — the user completes browser sign-in, selects a household, and approves granular \`mcp:*\` scopes. Revoke grants in Hub → Settings → Connected Agents.

**Advanced:** Organization API keys with \`mcp:*\` scopes for manual Bearer header auth (CI, legacy clients).

The MCP server exposes tools for inventory search, meal matching, meal planning, supply list management, cooking/consumption deduction, and credit checks.

## Discovery

- Agent auth discovery: \`/auth.md\`
- Connect landing: \`/connect\`
- API catalog: \`/.well-known/api-catalog\`
- OpenAPI description: \`/api/openapi.json\`
- OAuth authorization server: \`/.well-known/oauth-authorization-server\`
- MCP protected resource metadata: \`/.well-known/oauth-protected-resource\` (on MCP host)
- REST protected resource metadata: \`/.well-known/oauth-protected-resource\` (on app domain; API keys)
- MCP server card: \`/.well-known/mcp/server-card.json\`
- Agent skills index: \`/.well-known/agent-skills/index.json\`
`;
