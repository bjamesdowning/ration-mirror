import { oauthErrorDetail } from "./oauth-query.server";

const AUTH_API_PREFIX = "/api/auth";

export function authApiUrl(request: Request, path: string): string {
	const base = new URL(request.url);
	return new URL(`${AUTH_API_PREFIX}${path}`, base).toString();
}

/**
 * Origin to attach to server-to-server auth.handler() sub-requests.
 *
 * Better Auth runs a CSRF origin check on every state-changing POST and rejects
 * requests with no Origin header ("Missing or null Origin"). Internally
 * constructed Request objects do not inherit the browser's Origin, so we must
 * set it explicitly to the worker's own origin, which is the default
 * trustedOrigin (baseURL).
 */
export function internalAuthOrigin(request: Request): string {
	return new URL(request.url).origin;
}

export async function readAuthHandlerJson<T>(response: Response): Promise<T> {
	const text = await response.text();
	if (!text) {
		throw new Error(`Empty auth API response (${response.status})`);
	}
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new Error(
			`Invalid auth API JSON (${response.status}): ${text.slice(0, 120)}`,
		);
	}
}

/** Turn a non-2xx auth.handler response into a throwable Error with BA fields. */
export async function throwIfAuthHandlerFailed(
	response: Response,
): Promise<void> {
	if (response.ok) {
		return;
	}
	let detail = `HTTP ${response.status}`;
	try {
		const body = await readAuthHandlerJson<{
			message?: string;
			error?: string;
			error_description?: string;
		}>(response);
		detail = [body.error_description, body.message, body.error]
			.filter(Boolean)
			.join(" ");
	} catch (readError) {
		detail = oauthErrorDetail(readError);
	}
	throw new Error(detail || `HTTP ${response.status}`);
}
