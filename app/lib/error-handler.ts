import { data } from "react-router";
import { z } from "zod";
import { CapacityExceededError } from "./capacity.server";
import { GroupMembershipError } from "./group-membership.server";
import { log } from "./logging.server";
import { SupplySyncBusyError } from "./supply-sync-lock.server";
import { emitApiOutcome } from "./telemetry.server";

const MAX_ERROR_CAUSE_DEPTH = 5;

/**
 * Flatten Drizzle/D1 error trees. Drizzle wraps SQL failures as
 * `Failed query: …` and puts the real reason on `error.cause`.
 */
export function flattenErrorText(
	error: unknown,
	depth = MAX_ERROR_CAUSE_DEPTH,
): string {
	if (error == null) return "";
	if (typeof error === "string") return error;
	if (!(error instanceof Error)) return String(error);

	const parts: string[] = [error.message];
	let current: unknown = error.cause;
	for (let i = 0; i < depth && current != null; i++) {
		if (current instanceof Error) {
			parts.push(current.message);
			current = current.cause;
		} else {
			parts.push(String(current));
			break;
		}
	}
	return parts.join("\n");
}

function errorText(error: unknown): string {
	return flattenErrorText(error).toLowerCase();
}

/**
 * Returns true for permanent D1/SQL failures (schema drift, bad queries).
 * These should not be retried or mislabeled as transient load issues.
 * Do NOT match bare "failed query" — that is Drizzle's wrapper for almost
 * every D1 failure; inspect `cause` via flattenErrorText instead.
 */
export function isD1SchemaError(error: unknown): boolean {
	const msg = errorText(error);
	if (!msg) return false;
	return (
		msg.includes("no such table") ||
		msg.includes("no such column") ||
		msg.includes("syntax error") ||
		msg.includes("ambiguous column") ||
		msg.includes("d1_column_notfound")
	);
}

/**
 * Permanent query-shape failures from D1's 100 bound-parameter ceiling.
 * Still mapped to 503 `server_busy` for clients, but must not be retried.
 */
export function isD1ParamLimitError(error: unknown): boolean {
	const msg = errorText(error);
	if (!msg) return false;
	return (
		msg.includes("too many bound parameters") ||
		msg.includes("too many sql variables") ||
		msg.includes("sqlite_range")
	);
}

/**
 * Returns true for errors that indicate D1 write contention or transient
 * infrastructure failures. Detected via error message patterns from D1 and
 * Cloudflare Workers runtime.
 */
export function isD1ContentionError(error: unknown): boolean {
	if (isD1SchemaError(error)) return false;
	const msg = errorText(error);
	if (!msg) return false;
	return (
		msg.includes("sqlite_busy") ||
		isD1ParamLimitError(error) ||
		msg.includes("database is locked") ||
		msg.includes("too many connections") ||
		msg.includes("timeout") ||
		msg.includes("worker exceeded") ||
		// D1 HTTP error codes for timeouts
		msg.includes("522") ||
		msg.includes("524")
	);
}

function isDataWithResponseInit(error: unknown): boolean {
	return (
		error !== null &&
		typeof error === "object" &&
		"type" in error &&
		(error as { type: string }).type === "DataWithResponseInit"
	);
}

/** Retries transient D1 failures (contention, timeouts) with linear backoff. */
export async function retryOnD1Contention<T>(
	fn: () => Promise<T>,
	options?: { maxAttempts?: number; delayMs?: number },
): Promise<T> {
	const maxAttempts = options?.maxAttempts ?? 3;
	const delayMs = options?.delayMs ?? 100;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			// Param-limit errors are permanent for this query shape — do not retry.
			if (
				isD1ParamLimitError(error) ||
				!isD1ContentionError(error) ||
				attempt === maxAttempts
			) {
				throw error;
			}
			await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
		}
	}

	throw new Error("retryOnD1Contention exhausted attempts");
}

/**
 * Run a route loader with D1 retry and map transient infrastructure failures to
 * a 503 `data()` response instead of an opaque "Unexpected Server Error".
 */
export async function runRouteLoader<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await retryOnD1Contention(fn);
	} catch (error) {
		rethrowRouteLoaderError(error);
	}
}

export function rethrowRouteLoaderError(error: unknown): never {
	if (error instanceof Response) {
		throw error;
	}

	if (isDataWithResponseInit(error)) {
		throw error;
	}

	if (isD1ContentionError(error)) {
		log.warn("[loader] D1 contention or timeout", {
			errorMessage: flattenErrorText(error),
		});
		emitApiOutcome("503", "server_busy");
		throw data(
			{
				error:
					"The server is under heavy load. Please wait a moment and try again.",
				code: "server_busy" as const,
			},
			{
				status: 503,
				headers: { "Retry-After": "5" },
			},
		);
	}

	if (isD1SchemaError(error)) {
		log.critical("[loader] D1 schema or query error", error, {
			errorMessage: flattenErrorText(error),
		});
		emitApiOutcome("5xx", "admin_schema_error");
		throw data(
			{
				error: "Admin data is temporarily unavailable. Please try again later.",
				code: "admin_schema_error" as const,
			},
			{ status: 500 },
		);
	}

	throw error;
}

/**
 * Admin route loader wrapper — maps unhandled failures to structured responses
 * and logs server-side detail without exposing SQL internals to clients.
 */
export async function runAdminLoader<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await runRouteLoader(fn);
	} catch (error) {
		if (error instanceof Response) {
			throw error;
		}

		if (isDataWithResponseInit(error)) {
			throw error;
		}

		log.error("[admin.loader] Unhandled loader failure", error);
		throw data(
			{
				error: "Admin metrics unavailable. Please try again.",
				code: "admin_load_failed" as const,
			},
			{ status: 500 },
		);
	}
}

/**
 * Standardized error handler for API and Action routes.
 * Ensures consistent error responses and logging.
 * Re-throws DataWithResponseInit so React Router handles them correctly.
 */
export function handleApiError(error: unknown) {
	if (error instanceof z.ZodError) {
		return data(
			{ error: "Validation failed", details: error.flatten() },
			{ status: 400 },
		);
	}

	if (error instanceof Response) {
		return error;
	}

	// Re-throw RR data() responses so the framework handles them
	if (isDataWithResponseInit(error)) {
		throw error;
	}

	if (error instanceof CapacityExceededError) {
		return data(
			{
				error: "capacity_exceeded",
				code: "capacity_exceeded" as const,
				resource: error.resource,
				current: error.current,
				limit: error.limit,
				tier: error.tier,
				isExpired: error.isExpired,
				canAdd: error.canAdd,
				upgradePath: "crew_member",
			},
			{ status: 403 },
		);
	}

	if (error instanceof GroupMembershipError) {
		return data(
			{ error: error.message, code: error.code },
			{ status: error.status },
		);
	}

	if (error instanceof SupplySyncBusyError) {
		log.warn("[API] Supply sync lock contention", {
			errorMessage: error.message,
		});
		emitApiOutcome("429", "supply_sync_busy");
		return data(
			{
				error:
					"Supply sync is already running. Please wait a moment and try again.",
				code: "supply_sync_busy" as const,
			},
			{
				status: 429,
				headers: { "Retry-After": String(error.retryAfterSeconds) },
			},
		);
	}

	// Graceful tier gate: convert capacity_exceeded throws to 403 with upgrade path
	if (
		error instanceof Error &&
		error.message.startsWith("capacity_exceeded:")
	) {
		const parts = error.message.split(":");
		const resource = parts[1] ?? "unknown";
		return data(
			{
				error: "capacity_exceeded",
				resource,
				upgradePath: "crew_member",
			},
			{ status: 403 },
		);
	}

	// Insufficient Cargo: cook/deduct failed — return 422 so clients can show a clear message
	if (
		error instanceof Error &&
		error.message.startsWith("Insufficient Cargo for:")
	) {
		return data(
			{ error: error.message, code: "insufficient_cargo" as const },
			{ status: 422 },
		);
	}

	// Linked cargo row missing during cook deduction
	if (
		error instanceof Error &&
		error.message.startsWith("Cargo not found for ingredient")
	) {
		return data(
			{
				error:
					"A linked Cargo item is missing. Re-link the ingredient or update the recipe, then try again.",
				code: "cargo_not_found" as const,
			},
			{ status: 422 },
		);
	}

	// Unit mismatch between recipe ingredient and cargo stock
	if (error instanceof Error && error.message.startsWith("Cannot convert")) {
		return data(
			{
				error:
					"Ingredient units do not match Cargo. Update the recipe or cargo unit, then try again.",
				code: "unit_conversion_failed" as const,
			},
			{ status: 422 },
		);
	}

	// Meal missing or not in the caller's organization
	if (error instanceof Error && error.message.startsWith("Meal not found")) {
		return data(
			{
				error: "Meal not found or you do not have access to it.",
				code: "not_found" as const,
			},
			{ status: 404 },
		);
	}

	// D1 contention / transient infrastructure error — return 503 with a
	// user-friendly message and Retry-After hint instead of a generic 500.
	if (isD1ContentionError(error)) {
		log.warn("[API] D1 contention or timeout", {
			errorMessage: flattenErrorText(error),
		});
		emitApiOutcome("503", "server_busy");
		return data(
			{
				error:
					"The server is under heavy load. Please wait a moment and try again.",
				code: "server_busy" as const,
			},
			{
				status: 503,
				headers: { "Retry-After": "5" },
			},
		);
	}

	if (isD1SchemaError(error)) {
		log.critical("[API] D1 schema or query error", error, {
			errorMessage: flattenErrorText(error),
		});
		emitApiOutcome("5xx", "admin_schema_error");
		return data(
			{
				error: "Admin data is temporarily unavailable. Please try again later.",
				code: "admin_schema_error" as const,
			},
			{ status: 500 },
		);
	}

	log.error("[API] Unhandled error", error, {
		errorMessage: flattenErrorText(error),
	});
	emitApiOutcome("5xx", "unhandled");

	// Never expose raw error details to clients — prevents information disclosure
	return data(
		{ error: "An unexpected error occurred. Please try again later." },
		{ status: 500 },
	);
}

/**
 * Returns a safe, user-facing error message for MCP tool responses.
 * Logs the real error server-side; never exposes internal details to the client.
 * Use in MCP tool catch blocks — call log.error before returning.
 */
export function publicErrorMessageForTool(error: unknown): string {
	if (error instanceof z.ZodError) {
		const flat = error.flatten();
		const fieldKeys = Object.keys(flat.fieldErrors).filter(Boolean);
		return fieldKeys.length > 0
			? `Validation failed: ${fieldKeys.join(", ")}`
			: "Validation failed.";
	}

	if (error instanceof Error) {
		// Insufficient Cargo is actionable — user needs to add ingredients
		if (error.message.startsWith("Insufficient Cargo for:")) {
			return error.message;
		}
		// capacity_exceeded — safe tier message, no internal detail
		if (error.message.startsWith("capacity_exceeded:")) {
			return "Tier limit reached. Upgrade or remove items.";
		}
		// D1 contention — same copy as handleApiError
		if (isD1ContentionError(error)) {
			return "The server is under heavy load. Please wait a moment and try again.";
		}
	}

	return "An unexpected error occurred. Try again later.";
}
