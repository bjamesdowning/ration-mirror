import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { authenticateMcp, MCP_AUTH_ERRORS } from "../app/lib/mcp/auth";
import { registerTools } from "../app/lib/mcp/tools";

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
		// Only authenticate /mcp. OAuth discovery paths (/.well-known/*, /register) get 404
		// so mcp-remote can fail discovery cleanly and use custom headers for the MCP endpoint.
		const url = new URL(request.url);
		if (url.pathname !== "/mcp") {
			return new Response("Not Found", { status: 404 });
		}

		try {
			// Extract orgId from API key
			const orgId = await authenticateMcp(env, request);

			// Inject organizationId into environment for tool handlers
			const envWithOrg = { ...env, __orgId: orgId };

			// Create a new strict server instance per request (CVE requirement)
			const server = createServer(envWithOrg);

			// Standard stateless MCP handler
			// @ts-expect-error - Internal type mismatch between library versions
			const handler = createMcpHandler(server, { route: "/mcp" });

			return await handler(request, envWithOrg, ctx);
		} catch (error) {
			const isAuthError =
				error instanceof Error && MCP_AUTH_ERRORS.has(error.message);
			const status = isAuthError ? 401 : 500;
			// Only surface auth error messages to the caller; mask internal failures
			const message = isAuthError ? error.message : "Internal Server Error";
			return Response.json({ error: message }, { status });
		}
	},
} satisfies ExportedHandler<Cloudflare.Env>;
