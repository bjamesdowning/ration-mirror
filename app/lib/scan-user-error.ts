/**
 * Customer-facing scan error copy. Technical details stay in server logs only.
 */

export const SCAN_USER_ERROR = {
	parse:
		"We couldn't read this receipt. Try a clearer photo or a shorter PDF, then try again.",
	schema: "We couldn't understand the items on this receipt. Please try again.",
	generic: "Something went wrong while scanning. Please try again.",
	missingUpload: "We couldn't find your upload. Please try scanning again.",
	timeout: "This receipt took too long to process. Please try again.",
	rateLimited: "Scan is temporarily busy. Please wait a moment and try again.",
	blocked: "This file couldn't be processed. Try a different photo or PDF.",
	config: "Scan isn't available right now. Please try again in a few minutes.",
} as const;

const TECHNICAL_ERROR_PATTERN =
	/JSON|Unexpected token|Expected ':' after property name|position \d+|SyntaxError|at position|ECONN|SQLITE|TypeError|ReferenceError|stack trace|undefined is not|cannot read prop/i;

export function isTechnicalErrorMessage(message: string): boolean {
	return TECHNICAL_ERROR_PATTERN.test(message);
}

/**
 * Map stored/thrown errors to safe UI copy.
 * Already-curated customer messages pass through; technical messages are replaced.
 */
export function toUserFacingScanError(
	error: unknown,
	fallback: string = SCAN_USER_ERROR.generic,
): string {
	if (typeof error === "string") {
		const trimmed = error.trim();
		if (!trimmed) return fallback;
		if (isTechnicalErrorMessage(trimmed)) return SCAN_USER_ERROR.parse;
		return trimmed;
	}
	if (error instanceof Error) {
		if (isTechnicalErrorMessage(error.message)) return SCAN_USER_ERROR.parse;
		return fallback;
	}
	return fallback;
}
