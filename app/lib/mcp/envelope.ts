/**
 * Standard MCP tool output envelope.
 *
 * Every MCP tool returns one `text` content item containing JSON of this shape.
 * This makes responses deterministic and machine-parseable for downstream
 * agents (Claude Code, Cursor, etc.) without requiring per-tool format quirks.
 */

import { z } from "zod";
import { CapacityExceededError } from "../capacity.server";
import { isD1ContentionError } from "../error-handler";
import { log } from "../logging.server";

export interface ToolMeta {
	rateLimit?: { remaining: number; resetAt: number };
	nextCursor?: string | null;
	total?: number;
	replayed?: boolean;
}

export type ToolEnvelope<T = unknown> =
	| {
			ok: true;
			tool: string;
			data: T;
			warnings?: string[];
			meta?: ToolMeta;
	  }
	| {
			ok: false;
			tool: string;
			error: {
				code: ToolErrorCode;
				message: string;
				details?: unknown;
				retryAfter?: number;
			};
	  };

export type ToolErrorCode =
	| "rate_limited"
	| "invalid_input"
	| "not_found"
	| "unauthorized"
	| "insufficient_scope"
	| "capacity_exceeded"
	| "conflict"
	| "idempotency_replay"
	| "internal_error"
	| "insufficient_cargo";

/** Wraps an envelope into the MCP `content` array shape that `server.tool` returns. */
export function toolReply<T>(
	_toolName: string,
	body: ToolEnvelope<T>,
): { content: Array<{ type: "text"; text: string }> } {
	return {
		content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
	};
}

/** Build a typed `ok: true` envelope. */
export function ok<T>(
	tool: string,
	data: T,
	extra?: { warnings?: string[]; meta?: ToolMeta },
): ToolEnvelope<T> {
	const out: {
		ok: true;
		tool: string;
		data: T;
		warnings?: string[];
		meta?: ToolMeta;
	} = { ok: true, tool, data };
	if (extra?.warnings && extra.warnings.length > 0)
		out.warnings = extra.warnings;
	if (extra?.meta) out.meta = extra.meta;
	return out;
}

/** Build a typed `ok: false` envelope. */
export function err(
	tool: string,
	code: ToolErrorCode,
	message: string,
	extra?: { details?: unknown; retryAfter?: number },
): ToolEnvelope<never> {
	const error: {
		code: ToolErrorCode;
		message: string;
		details?: unknown;
		retryAfter?: number;
	} = {
		code,
		message,
	};
	if (extra?.details !== undefined) error.details = extra.details;
	if (extra?.retryAfter !== undefined) error.retryAfter = extra.retryAfter;
	return { ok: false, tool, error };
}

/**
 * Map a thrown error into a `ToolEnvelope` failure. Logs via `log.error`
 * server-side. Never leaks raw error details.
 */
export function mapErrorToEnvelope(
	tool: string,
	error: unknown,
): ToolEnvelope<never> {
	if (error instanceof z.ZodError) {
		const flat = error.flatten();
		const fieldKeys = Object.keys(flat.fieldErrors).filter(Boolean);
		return err(
			tool,
			"invalid_input",
			fieldKeys.length > 0
				? `Validation failed: ${fieldKeys.join(", ")}`
				: "Validation failed.",
			{ details: flat },
		);
	}

	if (error instanceof CapacityExceededError) {
		return err(tool, "capacity_exceeded", error.message, {
			details: {
				resource: error.resource,
				current: error.current,
				limit: error.limit,
				tier: error.tier,
			},
		});
	}

	if (error instanceof Error) {
		if (error.message.startsWith("Insufficient Cargo for:")) {
			return err(tool, "insufficient_cargo", error.message);
		}
		if (error.message.startsWith("capacity_exceeded")) {
			return err(
				tool,
				"capacity_exceeded",
				"Tier limit reached. Upgrade or remove items.",
			);
		}
		if (isD1ContentionError(error)) {
			return err(
				tool,
				"internal_error",
				"The server is under heavy load. Please wait a moment and try again.",
				{ retryAfter: 5 },
			);
		}
	}

	log.error("[MCP] Tool error", error);
	return err(
		tool,
		"internal_error",
		"An unexpected error occurred. Try again later.",
	);
}

/** Standard rate-limit envelope. */
export function rateLimited(
	tool: string,
	retryAfter: number,
): ToolEnvelope<never> {
	return err(
		tool,
		"rate_limited",
		`Rate limit exceeded. Retry after ${retryAfter} seconds.`,
		{ retryAfter },
	);
}

/** Cursor encode helper for `(createdAt, id)` pagination. */
export function encodeCursor(payload: {
	createdAt: string;
	id: string;
}): string {
	const json = JSON.stringify(payload);
	if (typeof btoa === "function") return btoa(json);
	return Buffer.from(json, "utf8").toString("base64");
}

/** Cursor decode helper. Returns null on malformed input. */
export function decodeCursor(
	cursor: string,
): { createdAt: string; id: string } | null {
	try {
		const json =
			typeof atob === "function"
				? atob(cursor)
				: Buffer.from(cursor, "base64").toString("utf8");
		const parsed = JSON.parse(json);
		if (
			parsed &&
			typeof parsed.createdAt === "string" &&
			typeof parsed.id === "string"
		) {
			return { createdAt: parsed.createdAt, id: parsed.id };
		}
		return null;
	} catch {
		return null;
	}
}
