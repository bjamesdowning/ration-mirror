import { APIError } from "better-auth";
import { flattenErrorText, isD1ContentionError } from "~/lib/error-handler";

/**
 * Better Auth's getSession catch block logs the real D1 error then throws a fresh
 * APIError(FAILED_TO_GET_SESSION) without preserving `cause`. Treat 500 session
 * lookup failures as transient so we can retry and map to server_busy.
 *
 * UNAUTHORIZED + FAILED_TO_GET_SESSION is a real auth miss — not transient.
 */
export function isTransientAuthSessionLookupError(error: unknown): boolean {
	if (isD1ContentionError(error)) return true;

	if (error instanceof APIError) {
		if (error.statusCode !== 500) return false;
		const body = error.body;
		const code =
			body && typeof body === "object" && "code" in body
				? String((body as { code?: unknown }).code ?? "")
				: "";
		const message =
			body && typeof body === "object" && "message" in body
				? String((body as { message?: unknown }).message ?? "")
				: error.message;
		if (code === "FAILED_TO_GET_SESSION") return true;
		if (message.toLowerCase().includes("failed to get session")) return true;
		return false;
	}

	const text = flattenErrorText(error).toLowerCase();
	return text.includes("failed to get session");
}
