/**
 * MCP worker response helpers (shared by workers/mcp.ts and unit tests).
 */

/** Strip internal error text from JSON-RPC 500 responses. */
export async function sanitizeMcpHandlerResponse(
	response: Response,
): Promise<Response> {
	if (response.status < 500) {
		return response;
	}
	const contentType = response.headers.get("Content-Type") ?? "";
	if (!contentType.includes("application/json")) {
		return response;
	}

	// Clone headers and drop Content-Length: the sanitized body differs in size
	// from the original, so a stale Content-Length would corrupt the response.
	const sanitizedHeaders = new Headers(response.headers);
	sanitizedHeaders.delete("Content-Length");

	const body = await response.text();
	try {
		const parsed = JSON.parse(body) as {
			jsonrpc?: string;
			error?: { code?: number; message?: string };
			id?: unknown;
		};
		if (parsed?.error?.message) {
			parsed.error.message = "Internal server error";
			return new Response(JSON.stringify(parsed), {
				status: response.status,
				statusText: response.statusText,
				headers: sanitizedHeaders,
			});
		}
	} catch {
		// Fall through to generic body replacement.
	}

	return new Response(
		JSON.stringify({
			jsonrpc: "2.0",
			error: { code: -32603, message: "Internal server error" },
			id: null,
		}),
		{
			status: response.status,
			statusText: response.statusText,
			headers: sanitizedHeaders,
		},
	);
}

export const MCP_CORS_HEADERS: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Expose-Headers": "WWW-Authenticate, mcp-session-id",
};

export function withMcpCors(response: Response): Response {
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
