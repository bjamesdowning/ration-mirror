const MAX_RESPONSE_BODY_CHARS = 400;

/**
 * Extra Workers Logs fields for AI SDK / Gateway failures.
 * `APICallError.message` is often empty; the useful text is `responseBody`.
 */
export function copilotInferenceErrorContext(
	error: unknown,
): Record<string, unknown> {
	if (!error || typeof error !== "object") {
		return { errorDetail: String(error) };
	}

	const record = error as {
		name?: unknown;
		message?: unknown;
		statusCode?: unknown;
		url?: unknown;
		responseBody?: unknown;
	};

	const message =
		typeof record.message === "string" && record.message.trim().length > 0
			? record.message
			: undefined;
	const body =
		typeof record.responseBody === "string" && record.responseBody.length > 0
			? record.responseBody.slice(0, MAX_RESPONSE_BODY_CHARS)
			: undefined;

	return {
		...(typeof record.name === "string" ? { errorName: record.name } : {}),
		...(message ? { errorMessage: message } : {}),
		...(typeof record.statusCode === "number"
			? { statusCode: record.statusCode }
			: {}),
		...(typeof record.url === "string" ? { url: record.url } : {}),
		...(body ? { responseBody: body } : {}),
	};
}
