import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { authenticateMcp, MCP_AUTH_ERRORS } from "../app/lib/mcp/auth";
import { registerTools } from "../app/lib/mcp/tools";

const PROTECTED_RESOURCE_PATHS = new Set([
	"/.well-known/oauth-protected-resource",
	"/.well-known/oauth-protected-resource/mcp",
]);

/** Build RFC 9728 metadata and WWW-Authenticate values from request origin. */
function getMcpResourceUrls(request: Request): {
	mcpBaseUrl: string;
	resourceDocumentation: string;
} {
	const url = new URL(request.url);
	const mcpBaseUrl = url.origin;
	const appHost = url.hostname.replace(/^mcp\./, "") || url.hostname;
	const resourceDocumentation = `${url.protocol}//${appHost}/hub/settings`;
	return { mcpBaseUrl, resourceDocumentation };
}

function createServer(env: Cloudflare.Env & { __orgId: string }) {
	const server = new McpServer({
		name: "Ration MCP",
		version: "1.0.0",
	});

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
			const { mcpBaseUrl, resourceDocumentation } = getMcpResourceUrls(request);
			return Response.json(
				{
					resource: mcpBaseUrl,
					resource_name: "Ration MCP",
					bearer_methods_supported: ["header"],
					resource_documentation: resourceDocumentation,
				},
				{
					headers: {
						"Access-Control-Allow-Origin": "*",
						"Cache-Control": "public, max-age=3600",
					},
				},
			);
		}

		if (url.pathname !== "/mcp") {
			return new Response("Not Found", { status: 404 });
		}

		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
					"Access-Control-Allow-Headers":
						"Content-Type, Accept, Authorization, mcp-session-id, MCP-Protocol-Version",
					"Access-Control-Max-Age": "86400",
				},
			});
		}

		try {
			// Extract orgId from API key
			const orgId = await authenticateMcp(env, request);

			// Inject organizationId into environment for tool handlers
			const envWithOrg = { ...env, __orgId: orgId };

			// Create a new strict server instance per request (CVE requirement)
			const server = createServer(envWithOrg);

			// Standard stateless MCP handler. Cast needed: agents bundles its own
			// @modelcontextprotocol/sdk; our McpServer is from the project's SDK — structurally
			// compatible but distinct type identities.
			const handler = createMcpHandler(
				server as unknown as Parameters<typeof createMcpHandler>[0],
				{ route: "/mcp" },
			);

			return await handler(request, envWithOrg, ctx);
		} catch (error) {
			const isAuthError =
				error instanceof Error && MCP_AUTH_ERRORS.has(error.message);
			const status = isAuthError ? 401 : 500;
			const message = isAuthError ? error.message : "Internal Server Error";
			const { mcpBaseUrl } = getMcpResourceUrls(request);
			const wwwAuth = `Bearer realm="Ration MCP", resource_metadata="${mcpBaseUrl}/.well-known/oauth-protected-resource"`;
			return Response.json(
				{ error: message },
				isAuthError
					? { status, headers: { "WWW-Authenticate": wwwAuth } }
					: { status },
			);
		}
	},
} satisfies ExportedHandler<Cloudflare.Env>;
