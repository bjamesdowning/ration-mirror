/**
 * MCP e2e harness: a minimal JSON-RPC client for the Streamable HTTP
 * transport, plus the response checks every tool case runs.
 *
 * The client speaks to the real ration-mcp worker bundle over HTTP. It
 * accepts both JSON and SSE replies, since the transport may answer either.
 */

export type JsonRpcResponse = {
	jsonrpc: "2.0";
	id?: number | string | null;
	result?: Record<string, unknown>;
	error?: { code: number; message: string; data?: unknown };
};

export type ToolCallResult = {
	content: Array<{ type: string; text: string }>;
	structuredContent?: Record<string, unknown>;
	isError?: boolean;
};

export type HttpReply = {
	status: number;
	headers: Headers;
	messages: JsonRpcResponse[];
	raw: string;
};

/** Parse a JSON or text/event-stream body into JSON-RPC messages. */
export function parseRpcBody(
	contentType: string,
	raw: string,
): JsonRpcResponse[] {
	if (raw.trim() === "") return [];
	if (contentType.includes("text/event-stream")) {
		const messages: JsonRpcResponse[] = [];
		for (const event of raw.split(/\r?\n\r?\n/)) {
			const data = event
				.split(/\r?\n/)
				.filter((line) => line.startsWith("data:"))
				.map((line) => line.slice(5).trimStart())
				.join("\n");
			if (data) messages.push(JSON.parse(data) as JsonRpcResponse);
		}
		return messages;
	}
	const parsed = JSON.parse(raw) as JsonRpcResponse | JsonRpcResponse[];
	return Array.isArray(parsed) ? parsed : [parsed];
}

export class McpTestClient {
	private nextId = 1;
	private sessionId: string | null = null;
	private protocolVersion: string | null = null;

	constructor(
		private readonly url: string,
		private readonly bearer: string | null,
	) {}

	async post(body: unknown): Promise<HttpReply> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
		};
		if (this.bearer) headers.Authorization = `Bearer ${this.bearer}`;
		if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
		if (this.protocolVersion) {
			headers["MCP-Protocol-Version"] = this.protocolVersion;
		}
		const response = await fetch(this.url, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
		});
		const raw = await response.text();
		const sessionId = response.headers.get("mcp-session-id");
		if (sessionId) this.sessionId = sessionId;
		const contentType = response.headers.get("content-type") ?? "";
		let messages: JsonRpcResponse[] = [];
		if (response.status < 400 || contentType.includes("json")) {
			try {
				messages = parseRpcBody(contentType, raw);
			} catch {
				messages = [];
			}
		}
		return {
			status: response.status,
			headers: response.headers,
			messages,
			raw,
		};
	}

	async request(
		method: string,
		params?: Record<string, unknown>,
	): Promise<JsonRpcResponse> {
		const id = this.nextId++;
		const reply = await this.post({ jsonrpc: "2.0", id, method, params });
		const message = reply.messages.find((m) => m.id === id);
		if (!message) {
			throw new Error(
				`${method}: no JSON-RPC reply for id ${id} (HTTP ${reply.status}): ${reply.raw.slice(0, 500)}`,
			);
		}
		return message;
	}

	async initialize(): Promise<Record<string, unknown>> {
		const reply = await this.request("initialize", {
			protocolVersion: "2025-06-18",
			capabilities: {},
			clientInfo: { name: "ration-mcp-e2e", version: "1.0.0" },
		});
		if (reply.error || !reply.result) {
			throw new Error(`initialize failed: ${JSON.stringify(reply.error)}`);
		}
		const version = reply.result.protocolVersion;
		if (typeof version === "string") this.protocolVersion = version;
		await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
		return reply.result;
	}

	async listTools(): Promise<
		Array<{ name: string; inputSchema?: unknown; annotations?: unknown }>
	> {
		const tools: Array<{ name: string }> = [];
		let cursor: string | undefined;
		do {
			const reply = await this.request(
				"tools/list",
				cursor ? { cursor } : undefined,
			);
			if (reply.error || !reply.result) {
				throw new Error(`tools/list failed: ${JSON.stringify(reply.error)}`);
			}
			tools.push(...((reply.result.tools as Array<{ name: string }>) ?? []));
			cursor =
				typeof reply.result.nextCursor === "string"
					? reply.result.nextCursor
					: undefined;
		} while (cursor);
		return tools;
	}

	async callTool(
		name: string,
		args: Record<string, unknown>,
	): Promise<{ result: ToolCallResult; bytes: number }> {
		const reply = await this.request("tools/call", { name, arguments: args });
		if (reply.error || !reply.result) {
			throw new Error(
				`tools/call ${name} JSON-RPC error: ${JSON.stringify(reply.error)}`,
			);
		}
		const result = reply.result as unknown as ToolCallResult;
		return { result, bytes: JSON.stringify(result).length };
	}
}

/**
 * Keys the agent profile must never return, at any depth. Kept here as an
 * independent copy of AGENT_DENIED_KEYS so the suite checks the server rather
 * than re-using its list. Matching ignores case and underscores, and any key
 * ending in `UserId` is also denied.
 */
export const DENIED_KEYS = new Set([
	"organizationId",
	"activeOrganizationId",
	"orgId",
	"userId",
	"memberId",
	"inviterId",
	"consentId",
	"healthSyncId",
	"credentialId",
	"apiKeyId",
	"clientId",
	"sessionId",
	"stripeCustomerId",
	"voidedByUserId",
]);

const normalize = (key: string) => key.replace(/_/g, "").toLowerCase();
const DENIED_NORMALIZED = new Set([...DENIED_KEYS].map(normalize));

export function isDeniedKey(key: string): boolean {
	const normalized = normalize(key);
	return DENIED_NORMALIZED.has(normalized) || normalized.endsWith("userid");
}

/**
 * Value-based check: which of these seeded values appear anywhere in a reply,
 * including inside strings, under any key (a bare `id`, a cursor, a URL).
 * The key deny-list above cannot see `organization: { id }`; this can.
 * Matching is case-insensitive.
 */
export function findSensitiveValues(
	reply: unknown,
	sensitive: Record<string, string>,
): string[] {
	const text = JSON.stringify(reply).toLowerCase();
	return Object.entries(sensitive)
		.filter(([, value]) => value.length > 0)
		.filter(([, value]) => text.includes(value.toLowerCase()))
		.map(([name]) => name);
}

/** Paths of every denied key in a JSON value. */
export function findDeniedKeys(value: unknown, path = "$"): string[] {
	if (Array.isArray(value)) {
		return value.flatMap((item, index) =>
			findDeniedKeys(item, `${path}[${index}]`),
		);
	}
	if (value === null || typeof value !== "object") return [];
	const hits: string[] = [];
	for (const [key, child] of Object.entries(value)) {
		if (isDeniedKey(key)) hits.push(`${path}.${key}`);
		hits.push(...findDeniedKeys(child, `${path}.${key}`));
	}
	return hits;
}

const ISO_DATETIME =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Paths of timestamp fields that are not an ISO-8601 string or null. A key
 * ending in `At` is a timestamp by convention (createdAt, expiresAt, …); a
 * UTC calendar date (YYYY-MM-DD) also passes. The old bug turned Dates into
 * `{}`, which this catches at any depth.
 */
export function findBadTimestamps(value: unknown, path = "$"): string[] {
	if (Array.isArray(value)) {
		return value.flatMap((item, index) =>
			findBadTimestamps(item, `${path}[${index}]`),
		);
	}
	if (value === null || typeof value !== "object") return [];
	const hits: string[] = [];
	for (const [key, child] of Object.entries(value)) {
		const childPath = `${path}.${key}`;
		if (/At$/.test(key)) {
			const okValue =
				child === null ||
				(typeof child === "string" &&
					(ISO_DATETIME.test(child) || ISO_DATE.test(child)));
			if (!okValue) hits.push(`${childPath}=${JSON.stringify(child)}`);
			continue;
		}
		hits.push(...findBadTimestamps(child, childPath));
	}
	return hits;
}

export function isIsoDateTime(value: unknown): boolean {
	return typeof value === "string" && ISO_DATETIME.test(value);
}

/** The structured envelope, checked against the text content copy. */
export function envelopeOf(result: ToolCallResult): Record<string, unknown> {
	const text = result.content.find((part) => part.type === "text")?.text;
	if (!text) throw new Error("tool result has no text content");
	const fromText = JSON.parse(text) as Record<string, unknown>;
	if (result.structuredContent) {
		const structured = JSON.stringify(result.structuredContent);
		if (structured !== JSON.stringify(fromText)) {
			throw new Error("structuredContent and text content disagree");
		}
	}
	return fromText;
}
