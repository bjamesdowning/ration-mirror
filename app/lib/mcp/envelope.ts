/**
 * Standard MCP tool output envelope.
 *
 * Every MCP tool returns one `text` content item containing JSON of this shape.
 * This makes responses deterministic and machine-parseable for downstream
 * agents (Claude Code, Cursor, etc.) without requiring per-tool format quirks.
 */

import { z } from "zod";
import { buildClaimRecoveryPaths } from "../agent/claim.constants";
import { CapacityExceededError } from "../capacity.server";
import { isD1ContentionError } from "../error-handler";
import { log } from "../logging.server";

export interface ToolMeta {
	rateLimit?: { remaining: number; resetAt: number };
	nextCursor?: string | null;
	total?: number;
	replayed?: boolean;
	/** Soft nudge for unclaimed agent kitchens on write tool success. */
	claimNudge?: {
		claimPage: string;
		reissueClaimUri: string;
		claimRequiredForOwnership: boolean;
	};
}

export type ToolErrorBody = {
	code: ToolErrorCode;
	message: string;
	details?: unknown;
	retryAfter?: number;
	/** One-line next step for agents to paraphrase to the user. */
	recoveryHint?: string;
};

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
			error: ToolErrorBody;
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
	| "insufficient_cargo"
	| "timeout";

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
	extra?: { details?: unknown; retryAfter?: number; recoveryHint?: string },
): ToolEnvelope<never> {
	const error: ToolErrorBody = {
		code,
		message,
	};
	if (extra?.details !== undefined) error.details = extra.details;
	if (extra?.retryAfter !== undefined) error.retryAfter = extra.retryAfter;
	if (extra?.recoveryHint !== undefined)
		error.recoveryHint = extra.recoveryHint;
	return { ok: false, tool, error };
}

/** Convenience for validation / bad-arg failures with an optional recovery hint. */
export function invalidInput(
	tool: string,
	message: string,
	extra?: { details?: unknown; recoveryHint?: string },
): ToolEnvelope<never> {
	return err(tool, "invalid_input", message, extra);
}

/** Trim Zod failures to field keys and first message per field (no formErrors blob). */
export function zodValidationDetails(
	error: z.ZodError,
): Record<string, string[]> {
	const flat = error.flatten();
	const details: Record<string, string[]> = {};
	for (const [key, messages] of Object.entries(flat.fieldErrors)) {
		const first = Array.isArray(messages) ? messages[0] : undefined;
		if (typeof first === "string") {
			details[key] = [first];
		}
	}
	return details;
}

/**
 * Map a thrown error into a `ToolEnvelope` failure. Logs via `log.error`
 * server-side. Never leaks raw error details.
 */
export function mapErrorToEnvelope(
	tool: string,
	error: unknown,
	options?: { preClaim?: boolean; origin?: string },
): ToolEnvelope<never> {
	if (error instanceof z.ZodError) {
		const details = zodValidationDetails(error);
		const fieldKeys = Object.keys(details);
		const parts = fieldKeys.map((key) => {
			const msg = details[key]?.[0];
			return msg ? `${key}: ${msg}` : key;
		});
		return err(
			tool,
			"invalid_input",
			parts.length > 0
				? `Validation failed — ${parts.join("; ")}`
				: "Validation failed.",
			{ details },
		);
	}

	if (error instanceof CapacityExceededError) {
		const details: Record<string, unknown> = {
			resource: error.resource,
			current: error.current,
			limit: error.limit,
			tier: error.tier,
		};
		if (options?.preClaim && options.origin) {
			const recovery = buildClaimRecoveryPaths(options.origin);
			details.claimPage = recovery.claimPage;
			details.reissueClaimUri = recovery.reissueClaimUri;
			details.claimRequiredForOwnership = true;
		}
		return err(tool, "capacity_exceeded", error.message, {
			details,
			recoveryHint:
				"Call get_billing_summary for upgrade options, or free capacity by removing items.",
		});
	}

	if (error instanceof Error) {
		if (error.message.startsWith("Insufficient Cargo for:")) {
			return err(tool, "insufficient_cargo", error.message, {
				recoveryHint:
					"Explain the shortfall to the user. Retry with confirmInsufficient:true only after they confirm a partial cook.",
			});
		}
		if (error.message.startsWith("Cargo not found for ingredient")) {
			return err(
				tool,
				"not_found",
				"A linked Cargo item is missing. Re-link the ingredient or update the recipe, then try again.",
				{
					recoveryHint:
						"Update the meal ingredient link or cargo row, then retry consume_meal.",
				},
			);
		}
		if (error.message.startsWith("Cannot convert")) {
			return err(
				tool,
				"invalid_input",
				"Ingredient units do not match Cargo. Update the recipe or cargo unit, then try again.",
				{
					recoveryHint:
						"Align ingredient and cargo units, then retry consume_meal.",
				},
			);
		}
		if (error.message.startsWith("capacity_exceeded")) {
			return err(
				tool,
				"capacity_exceeded",
				"Tier limit reached. Upgrade or remove items.",
				{
					recoveryHint:
						"Call get_billing_summary for upgrade options, or free capacity by removing items.",
				},
			);
		}
		if (/not found/i.test(error.message)) {
			return err(tool, "not_found", error.message, {
				recoveryHint:
					"Look up a valid id with the matching list/search tool, then retry.",
			});
		}
		if (isD1ContentionError(error)) {
			return err(
				tool,
				"internal_error",
				"The server is under heavy load. Please wait a moment and try again.",
				{ retryAfter: 5, recoveryHint: "Wait a few seconds and retry." },
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

export type InventoryListCursor = {
	sortBy: "createdAt" | "expiresAt";
	createdAt?: string;
	expiresAt?: string;
	id: string;
};

/** Inventory list cursor — supports createdAt or expiresAt pagination. */
export function encodeInventoryCursor(payload: InventoryListCursor): string {
	const json = JSON.stringify(payload);
	if (typeof btoa === "function") return btoa(json);
	return Buffer.from(json, "utf8").toString("base64");
}

/** Cursor decode helper. Returns null on malformed input. */
export function decodeCursor(
	cursor: string,
): { createdAt: string; id: string } | null {
	const parsed = decodeInventoryCursor(cursor);
	if (!parsed || parsed.sortBy !== "createdAt" || !parsed.createdAt) {
		return null;
	}
	return { createdAt: parsed.createdAt, id: parsed.id };
}

export function decodeInventoryCursor(
	cursor: string,
): InventoryListCursor | null {
	try {
		const json =
			typeof atob === "function"
				? atob(cursor)
				: Buffer.from(cursor, "base64").toString("utf8");
		const parsed = JSON.parse(json) as Partial<InventoryListCursor>;
		if (!parsed || typeof parsed.id !== "string") return null;
		if (parsed.sortBy === "expiresAt") {
			if (typeof parsed.expiresAt !== "string") return null;
			return {
				sortBy: "expiresAt",
				expiresAt: parsed.expiresAt,
				id: parsed.id,
			};
		}
		if (typeof parsed.createdAt === "string") {
			return {
				sortBy: "createdAt",
				createdAt: parsed.createdAt,
				id: parsed.id,
			};
		}
		// Legacy cursors without sortBy
		if (typeof (parsed as { createdAt?: string }).createdAt === "string") {
			return {
				sortBy: "createdAt",
				createdAt: (parsed as { createdAt: string }).createdAt,
				id: parsed.id,
			};
		}
		return null;
	} catch {
		return null;
	}
}
