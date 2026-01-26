import { data } from "react-router";
import { z } from "zod";

/**
 * Standardized error handler for API and Action routes.
 * Ensures consistent error responses and logging.
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

	const message =
		error instanceof Error ? error.message : "Internal Server Error";
	console.error("[API_ERROR]", error);

	return data({ error: message }, { status: 500 });
}
