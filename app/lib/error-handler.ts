import { data } from "react-router";
import { z } from "zod";
import { log } from "./logging.server";

/**
 * Returns true for errors that indicate D1 write contention or transient
 * infrastructure failures. Detected via error message patterns from D1 and
 * Cloudflare Workers runtime.
 */
export function isD1ContentionError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const msg = error.message.toLowerCase();
	return (
		msg.includes("d1_error") ||
		msg.includes("sqlite_busy") ||
		msg.includes("sqlite_range") ||
		msg.includes("too many bound parameters") ||
		msg.includes("database is locked") ||
		msg.includes("too many connections") ||
		msg.includes("timeout") ||
		msg.includes("worker exceeded") ||
		// D1 HTTP error codes for timeouts
		msg.includes("522") ||
		msg.includes("524")
	);
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
	if (
		error &&
		typeof error === "object" &&
		"type" in error &&
		(error as { type: string }).type === "DataWithResponseInit"
	) {
		throw error;
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

	// D1 contention / transient infrastructure error — return 503 with a
	// user-friendly message and Retry-After hint instead of a generic 500.
	if (isD1ContentionError(error)) {
		log.warn("[API] D1 contention or timeout", {
			errorMessage: error instanceof Error ? error.message : String(error),
		});
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

	log.error("[API] Unhandled error", error);

	// Never expose raw error details to clients — prevents information disclosure
	return data(
		{ error: "An unexpected error occurred. Please try again later." },
		{ status: 500 },
	);
}
