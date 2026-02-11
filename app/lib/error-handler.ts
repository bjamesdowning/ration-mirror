import { data } from "react-router";
import { z } from "zod";
import { log } from "./logging.server";

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

	const message =
		error instanceof Error ? error.message : "Internal Server Error";
	log.error("[API] Unhandled error", error);

	return data({ error: message }, { status: 500 });
}
