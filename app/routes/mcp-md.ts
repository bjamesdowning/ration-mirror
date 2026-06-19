import listingMd from "../../docs/mcp/README.md?raw";
import type { Route } from "./+types/mcp-md";

/**
 * /mcp.md — public MCP listing document for directories (mcpservers.org, etc.).
 */
export async function loader(_args: Route.LoaderArgs) {
	return new Response(listingMd, {
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
			"Access-Control-Allow-Origin": "*",
		},
	});
}
