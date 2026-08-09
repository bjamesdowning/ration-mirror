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
	/** True when cargo vectors are still backfilling after a write. */
	embeddingPending?: boolean;
	/** True when semantic search returned no hits (embeddings may still be pending). */
	embeddingMayBePending?: boolean;
	/** All-time count of expired cargo (before today UTC), ignoring list window. */
	expiredTotal?: number;
	/** Explicit daysBack window when set; null/undefined means unbounded. */
	daysBack?: number | null;
}

export type ToolErrorBody = {
	code: ToolErrorCode;
	message: string;
	details?: unknown;
	retryAfter?: number;
	/** One-line next step for agents to paraphrase to the user. */
	recoveryHint?: string;
};

export type ToolOutcome = "no_effect" | "committed" | "replayed" | "unknown";

export type ToolResultMeta = {
	outcome?: ToolOutcome;
	requestId?: string;
	operationId?: string;
	retryable?: boolean;
	retryAfterMs?: number;
};

export type ToolEnvelope<T = unknown> =
	| ({
			ok: true;
			tool: string;
			data: T;
			warnings?: string[];
			meta?: ToolMeta;
	  } & ToolResultMeta)
	| ({
			ok: false;
			tool: string;
			error: ToolErrorBody;
	  } & ToolResultMeta);

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
	| "timeout"
	| "timeout_ambiguous"
	| "feature_disabled"
	| "cook_eat_split_required"
	| "consent_required";

export const ToolEnvelopeSchema = z.object({
	ok: z.boolean(),
	tool: z.string(),
	data: z.unknown().optional(),
	warnings: z.array(z.string()).optional(),
	meta: z.record(z.string(), z.unknown()).optional(),
	error: z
		.object({
			code: z.string(),
			message: z.string(),
			details: z.unknown().optional(),
			retryAfter: z.number().optional(),
			recoveryHint: z.string().optional(),
		})
		.optional(),
	outcome: z.enum(["no_effect", "committed", "replayed", "unknown"]).optional(),
	requestId: z.string().optional(),
	operationId: z.string().optional(),
	retryable: z.boolean().optional(),
	retryAfterMs: z.number().optional(),
});

/** Wraps an envelope into MCP content + structuredContent for modern clients. */
export function toolReply<T>(
	_toolName: string,
	body: ToolEnvelope<T>,
): {
	content: Array<{ type: "text"; text: string }>;
	structuredContent: Record<string, unknown>;
	isError: boolean;
} {
	const structured = body as unknown as Record<string, unknown>;
	return {
		content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
		structuredContent: structured,
		isError: !body.ok,
	};
}

/** Build a typed `ok: true` envelope. */
export function ok<T>(
	tool: string,
	data: T,
	extra?: {
		warnings?: string[];
		meta?: ToolMeta;
	} & ToolResultMeta,
): ToolEnvelope<T> {
	const out: Extract<ToolEnvelope<T>, { ok: true }> = { ok: true, tool, data };
	if (extra?.warnings && extra.warnings.length > 0)
		out.warnings = extra.warnings;
	if (extra?.meta) out.meta = extra.meta;
	if (extra?.outcome !== undefined) out.outcome = extra.outcome;
	if (extra?.requestId !== undefined) out.requestId = extra.requestId;
	if (extra?.operationId !== undefined) out.operationId = extra.operationId;
	if (extra?.retryable !== undefined) out.retryable = extra.retryable;
	if (extra?.retryAfterMs !== undefined) out.retryAfterMs = extra.retryAfterMs;
	return out;
}

/** Build a typed `ok: false` envelope. */
export function err(
	tool: string,
	code: ToolErrorCode,
	message: string,
	extra?: {
		details?: unknown;
		retryAfter?: number;
		recoveryHint?: string;
	} & ToolResultMeta,
): ToolEnvelope<never> {
	const error: ToolErrorBody = {
		code,
		message,
	};
	if (extra?.details !== undefined) error.details = extra.details;
	if (extra?.retryAfter !== undefined) error.retryAfter = extra.retryAfter;
	if (extra?.recoveryHint !== undefined)
		error.recoveryHint = extra.recoveryHint;
	const out: Extract<ToolEnvelope<never>, { ok: false }> = {
		ok: false,
		tool,
		error,
	};
	if (extra?.outcome !== undefined) out.outcome = extra.outcome;
	if (extra?.requestId !== undefined) out.requestId = extra.requestId;
	if (extra?.operationId !== undefined) out.operationId = extra.operationId;
	if (extra?.retryable !== undefined) out.retryable = extra.retryable;
	if (extra?.retryAfterMs !== undefined) out.retryAfterMs = extra.retryAfterMs;
	return out;
}

/** Convenience for validation / bad-arg failures with an optional recovery hint. */
export function invalidInput(
	tool: string,
	message: string,
	extra?: { details?: unknown; recoveryHint?: string },
): ToolEnvelope<never> {
	return err(tool, "invalid_input", message, extra);
}

/**
 * Flag-gated feature is off (mirrors HTTP FEATURE_DISABLED).
 * Prefer this over throwing React Router `data()` from MCP handlers.
 */
export function featureDisabled(
	tool: string,
	message: string,
	recoveryHint?: string,
): ToolEnvelope<never> {
	return err(tool, "feature_disabled", message, {
		details: { code: "FEATURE_DISABLED" },
		recoveryHint:
			recoveryHint ??
			"This nutrition feature is temporarily unavailable. Retry later or use non-nutrition kitchen tools.",
	});
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

function isDataWithResponseInit(error: unknown): error is {
	type: string;
	data: unknown;
	init?: { status?: number };
} {
	return (
		error !== null &&
		typeof error === "object" &&
		"type" in error &&
		(error as { type: string }).type === "DataWithResponseInit"
	);
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

	if (isDataWithResponseInit(error)) {
		const payload =
			error.data !== null && typeof error.data === "object"
				? (error.data as Record<string, unknown>)
				: null;
		if (payload?.code === "FEATURE_DISABLED") {
			const message =
				typeof payload.error === "string"
					? payload.error
					: "This feature is temporarily unavailable.";
			return featureDisabled(tool, message);
		}
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
		const code =
			"code" in error && typeof (error as { code?: unknown }).code === "string"
				? (error as { code: string }).code
				: null;
		if (
			code === "nutrition_consent_required" ||
			error.name === "NutritionConsentRequiredError"
		) {
			return err(tool, "consent_required", error.message, {
				recoveryHint:
					"Ask the user to review and grant the required nutrition consent in Ration Privacy settings, then retry the same operation key.",
			});
		}
		if (
			code === "entry_not_prepared" ||
			error.name === "ManifestEntryNotPreparedError"
		) {
			return err(tool, "conflict", error.message, {
				recoveryHint:
					"Cook the entry first with cook_manifest_entries (or consume_meal for Galley), then log_manifest_intake.",
			});
		}
		if (
			code === "nutrition_unavailable" ||
			error.name === "NutritionUnavailableError" ||
			code === "nutrition_updating" ||
			error.name === "NutritionUpdatingError"
		) {
			return err(tool, "conflict", error.message, {
				recoveryHint:
					"Meal nutrition snapshot is missing — update the meal or skip intake for this entry.",
			});
		}
		if (
			code === "idempotency_conflict" ||
			code === "operation_in_progress" ||
			code === "nutrition_write_conflict" ||
			code === "undo_conflict"
		) {
			const retryable =
				code === "operation_in_progress" ||
				code === "nutrition_write_conflict" ||
				("retryable" in error &&
					(error as { retryable?: boolean }).retryable === true);
			return err(tool, "conflict", error.message, {
				details: { code, retryable },
				retryAfter: retryable ? 1 : undefined,
				recoveryHint: retryable
					? "Retry the same operationKey after a short delay. Never mint a new key for this request."
					: "Do not retry with a new key. Inspect the conflict code and reconcile client state.",
			});
		}
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
