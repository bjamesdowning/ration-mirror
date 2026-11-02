/**
 * MCP worker response helpers (shared by workers/mcp.ts and unit tests).
 */

function responseWithBody(response: Response, body: string): Response {
	const headers = new Headers(response.headers);
	headers.delete("Content-Length");
	return new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

/**
 * JSON-RPC -32602 is thrown before the tool handler. Append a validation
 * envelope the model can act on, and leave the JSON-RPC code unchanged.
 * Non-JSON bodies (including SSE) are left alone.
 */
async function annotateInvalidParams(response: Response): Promise<Response> {
	const contentType = response.headers.get("Content-Type") ?? "";
	if (!contentType.includes("application/json")) {
		return response;
	}
	const body = await response.text();
	try {
		const parsed = JSON.parse(body) as {
			error?: { code?: number; message?: string };
		};
		if (
			parsed?.error?.code === -32602 &&
			typeof parsed.error.message === "string" &&
			!parsed.error.message.includes('"validation_error"')
		) {
			const envelope = {
				ok: false,
				tool: "mcp",
				error: {
					code: "validation_error",
					message: parsed.error.message,
					recoveryHint: "Fix the named field and retry the same tool.",
				},
			};
			parsed.error.message = `${parsed.error.message}\n${JSON.stringify(envelope)}`;
			return responseWithBody(response, JSON.stringify(parsed));
		}
	} catch {
		// Keep the original body below.
	}
	return responseWithBody(response, body);
}

/** Strip internal error text from JSON-RPC 500 responses. */
export async function sanitizeMcpHandlerResponse(
	response: Response,
): Promise<Response> {
	if (response.status < 500) {
		return annotateInvalidParams(response);
	}
	const contentType = response.headers.get("Content-Type") ?? "";
	if (!contentType.includes("application/json")) {
		return response;
	}

	const body = await response.text();
	try {
		const parsed = JSON.parse(body) as {
			jsonrpc?: string;
			error?: { code?: number; message?: string };
			id?: unknown;
		};
		if (parsed?.error?.message) {
			parsed.error.message = "Internal server error";
			return responseWithBody(response, JSON.stringify(parsed));
		}
	} catch {
		// Fall through to generic body replacement.
	}

	return responseWithBody(
		response,
		JSON.stringify({
			jsonrpc: "2.0",
			error: { code: -32603, message: "Internal server error" },
			id: null,
		}),
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
