/** Align with agents DO handler body cap. */
export const MCP_MAX_BODY_BYTES = 4 * 1024 * 1024;
export const MCP_MAX_JSONRPC_BATCH = 10;

/**
 * Client IP for MCP HTTP rate limiting. Cloudflare sets CF-Connecting-IP at the
 * edge; do not trust X-Forwarded-For (spoofable off-Cloudflare).
 */
export function resolveMcpClientIp(request: Request): string {
	return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

/** @internal Exported for unit tests — bounded read of a request clone. */
export async function readBoundedBodyText(
	request: Request,
	maxBytes: number,
): Promise<string | Response> {
	const buffer = await request.clone().arrayBuffer();
	if (buffer.byteLength > maxBytes) {
		return Response.json({ error: "Request body too large" }, { status: 413 });
	}
	if (buffer.byteLength === 0) {
		return "";
	}
	return new TextDecoder().decode(buffer);
}

/**
 * Enforce MCP POST body size and JSON-RPC batch limits before auth/handler work.
 * Reads a bounded clone so the original request body remains for the MCP handler.
 */
export async function enforceMcpRequestLimits(
	request: Request,
): Promise<Response | null> {
	if (request.method !== "POST") {
		return null;
	}

	const contentLength = request.headers.get("Content-Length");
	if (contentLength) {
		const size = Number.parseInt(contentLength, 10);
		if (Number.isFinite(size) && size > MCP_MAX_BODY_BYTES) {
			return Response.json(
				{ error: "Request body too large" },
				{ status: 413 },
			);
		}
	}

	const bodyText = await readBoundedBodyText(request, MCP_MAX_BODY_BYTES);
	if (bodyText instanceof Response) {
		return bodyText;
	}

	if (bodyText.length === 0) {
		return null;
	}

	try {
		const parsed = JSON.parse(bodyText) as unknown;
		if (Array.isArray(parsed) && parsed.length > MCP_MAX_JSONRPC_BATCH) {
			return Response.json(
				{ error: `JSON-RPC batch exceeds maximum of ${MCP_MAX_JSONRPC_BATCH}` },
				{ status: 400 },
			);
		}
	} catch {
		// Let the MCP handler return a proper JSON-RPC parse error.
	}

	return null;
}
