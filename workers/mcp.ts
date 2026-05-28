import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import {
	AGENT_DISCOVERY_LINK_HEADER,
	buildMcpProtectedResourceMetadata,
} from "../app/lib/agent-readiness";
import type { McpToolContext } from "../app/lib/mcp/auth";
import { authenticateMcp, MCP_AUTH_ERRORS } from "../app/lib/mcp/auth";
import { registerTools } from "../app/lib/mcp/tools";
import { resolveAuthorizationServerUrl } from "../app/lib/oauth.constants";
import { checkRateLimit } from "../app/lib/rate-limiter.server";

const PROTECTED_RESOURCE_PATHS = new Set([
	"/.well-known/oauth-protected-resource",
	"/.well-known/oauth-protected-resource/mcp",
]);

const MCP_CORS_HEADERS: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Expose-Headers": "WWW-Authenticate",
};

/** Build RFC 9728 metadata and WWW-Authenticate values from request origin. */
function getMcpResourceUrls(request: Request): {
	mcpBaseUrl: string;
	resourceDocumentation: string;
} {
	const url = new URL(request.url);
	const mcpBaseUrl = url.origin;
	const appHost = url.hostname.replace(/^mcp\./, "") || url.hostname;
	const resourceDocumentation = `${url.protocol}//${appHost}/docs/api#mcp-server`;
	return { mcpBaseUrl, resourceDocumentation };
}

function withMcpCors(response: Response): Response {
	const headers = new Headers(response.headers);
	for (const [key, value] of Object.entries(MCP_CORS_HEADERS)) {
		headers.set(key, value);
	}
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

/**
 * Runtime guard against silent SDK incompatibilities. The cast in `createServer`
 * bridges two distinct copies of `@modelcontextprotocol/sdk` (one bundled by
 * `agents/mcp`, one in this project). If a future SDK upgrade removes any of
 * these symbols we want to fail loudly at boot, not at first tool call.
 */
function assertCompatibleMcpServer(
	server: unknown,
): asserts server is { tool: unknown; resource: unknown; prompt: unknown } {
	const s = server as Record<string, unknown> | null;
	if (!s || typeof s !== "object") {
		throw new Error("MCP SDK guard: server is not an object");
	}
	for (const sym of ["tool", "resource", "prompt"] as const) {
		if (typeof s[sym] !== "function") {
			throw new Error(
				`MCP SDK guard: server.${sym} is missing — SDK upgrade likely broke compatibility`,
			);
		}
	}
}

function createServer(
	env: Cloudflare.Env & { __mcp: McpToolContext; __orgId: string },
) {
	const server = new McpServer({
		name: "Ration MCP",
		version: "1.0.0",
	});

	assertCompatibleMcpServer(server);
	registerTools(server, env);

	return server;
}

export default {
	async fetch(
		request: Request,
		env: Cloudflare.Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		if (PROTECTED_RESOURCE_PATHS.has(url.pathname)) {
			const authServer = resolveAuthorizationServerUrl(env);
			const metadata = buildMcpProtectedResourceMetadata(request, authServer);
			return withMcpCors(
				Response.json(metadata, {
					headers: {
						...MCP_CORS_HEADERS,
						"Cache-Control": "public, max-age=3600",
					},
				}),
			);
		}

		if (url.pathname !== "/mcp") {
			return new Response("Not Found", { status: 404 });
		}

		if (request.method === "OPTIONS") {
			return withMcpCors(
				new Response(null, {
					status: 204,
					headers: {
						...MCP_CORS_HEADERS,
						"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
						"Access-Control-Allow-Headers":
							"Content-Type, Accept, Authorization, mcp-session-id, MCP-Protocol-Version",
						"Access-Control-Max-Age": "86400",
					},
				}),
			);
		}

		try {
			const clientIp =
				request.headers.get("CF-Connecting-IP") ??
				request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
				"unknown";
			const httpRl = await checkRateLimit(env.RATION_KV, "mcp_http", clientIp);
			if (!httpRl.allowed) {
				return withMcpCors(
					Response.json(
						{ error: "Too many requests" },
						{
							status: 429,
							headers: {
								"Retry-After": String(httpRl.retryAfter ?? 60),
							},
						},
					),
				);
			}

			const mcpCtx = await authenticateMcp(env, request);

			// Inject rich context AND legacy __orgId for one minor version of compat.
			const envWithCtx = {
				...env,
				__mcp: mcpCtx,
				__orgId: mcpCtx.organizationId,
			};

			// Create a new strict server instance per request (CVE requirement)
			const server = createServer(envWithCtx);

			// Standard stateless MCP handler. Cast needed: agents bundles its own
			// @modelcontextprotocol/sdk; our McpServer is from the project's SDK —
			// structurally compatible (validated by assertCompatibleMcpServer above)
			// but distinct type identities.
			const handler = createMcpHandler(
				server as unknown as Parameters<typeof createMcpHandler>[0],
				{ route: "/mcp" },
			);

			const response = await handler(request, envWithCtx, ctx);
			// Attach discovery Link header so any client that hits /mcp without
			// reading discovery first can still find the server card and protected-
			// resource metadata.
			const newHeaders = new Headers(response.headers);
			newHeaders.set("Link", AGENT_DISCOVERY_LINK_HEADER);
			for (const [key, value] of Object.entries(MCP_CORS_HEADERS)) {
				newHeaders.set(key, value);
			}
			return new Response(response.body, {
				status: response.status,
				statusText: response.statusText,
				headers: newHeaders,
			});
		} catch (error) {
			const isAuthError =
				error instanceof Error && MCP_AUTH_ERRORS.has(error.message);
			const status = isAuthError ? 401 : 500;
			const message = isAuthError ? error.message : "Internal Server Error";
			const { mcpBaseUrl } = getMcpResourceUrls(request);
			const wwwAuth = `Bearer realm="Ration MCP", resource_metadata="${mcpBaseUrl}/.well-known/oauth-protected-resource"`;
			return withMcpCors(
				Response.json(
					{ error: message },
					isAuthError
						? { status, headers: { "WWW-Authenticate": wwwAuth } }
						: { status },
				),
			);
		}
	},
} satisfies ExportedHandler<Cloudflare.Env>;
