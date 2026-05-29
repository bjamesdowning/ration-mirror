import { OAUTH_MCP_SCOPES, type OAuthMcpScope } from "./oauth.constants";

export type OAuthPagePath =
	| "/oauth/sign-in"
	| "/oauth/select-org"
	| "/oauth/consent";

/**
 * Extract the signed Better Auth oauth_query from a request URL.
 * Prefer nested `oauth_query` param; else flat query string when `sig` is present.
 */
export function getSignedOAuthQuery(url: URL): string | null {
	const nested = url.searchParams.get("oauth_query")?.trim();
	if (nested) {
		return nested;
	}
	if (url.searchParams.get("sig")) {
		const qs = url.search.slice(1);
		return qs.length > 0 ? qs : null;
	}
	return null;
}

/** Build a Ration OAuth page URL with a single opaque signed query param. */
export function buildOAuthPageUrl(
	path: OAuthPagePath,
	signedQuery: string,
): string {
	return `${path}?oauth_query=${encodeURIComponent(signedQuery)}`;
}

/** Parse `scope` from a Better Auth signed oauth_query blob. */
export function parseScopesFromSignedQuery(signedQuery: string): string[] {
	const scope = new URLSearchParams(signedQuery).get("scope");
	if (!scope) {
		return [];
	}
	return scope.split(/\s+/).filter(Boolean);
}

/**
 * Scopes to send to `oauth2Consent`: selected MCP scopes plus non-MCP scopes from
 * the original request (e.g. `offline_access`) that are not shown as checkboxes.
 */
export function buildConsentScopeForSubmit(
	selectedMcpScopes: OAuthMcpScope[],
	signedQuery: string,
): string {
	const requested = parseScopesFromSignedQuery(signedQuery);
	const nonMcp = requested.filter((s) => !s.startsWith("mcp:") && s !== "mcp");
	const mcpFromForm = selectedMcpScopes;
	const mcpFallback = requested.filter((s): s is OAuthMcpScope =>
		(OAUTH_MCP_SCOPES as readonly string[]).includes(s),
	);
	const mcp = mcpFromForm.length > 0 ? mcpFromForm : mcpFallback;
	return [...new Set([...mcp, ...nonMcp])].join(" ");
}

/**
 * Base64-wrap signed oauth_query for HTML forms so `application/x-www-form-urlencoded`
 * POST does not turn `+` into spaces and break Better Auth signature verification.
 */
export function encodeOAuthQueryForForm(signedQuery: string): string {
	return btoa(signedQuery);
}

export function decodeOAuthQueryFromForm(encoded: string): string | null {
	try {
		return atob(encoded);
	} catch {
		return null;
	}
}

function parseCookieHeader(cookieHeader: string): Map<string, string> {
	const cookieMap = new Map<string, string>();
	for (const part of cookieHeader.split(";")) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		const name = trimmed.slice(0, eq);
		const value = trimmed.slice(eq + 1);
		if (name) cookieMap.set(name, value);
	}
	return cookieMap;
}

function parseSetCookieLine(
	setCookie: string,
): { name: string; value: string } | null {
	const [nameValue] = setCookie.split(";");
	const trimmed = nameValue?.trim();
	if (!trimmed) return null;
	const eq = trimmed.indexOf("=");
	if (eq === -1) return null;
	const name = trimmed.slice(0, eq);
	const value = trimmed.slice(eq + 1);
	if (!name || value === undefined) return null;
	return {
		name,
		value: value.includes("%") ? decodeURIComponent(value) : value,
	};
}

/** Merge Set-Cookie from auth.api into the Cookie header for the next auth.api call. */
export function mergeSessionCookies(
	request: Request,
	authResult: { headers: Headers },
): Headers {
	const headers = new Headers(request.headers);
	const cookieMap = parseCookieHeader(headers.get("cookie") ?? "");

	const setCookies =
		typeof authResult.headers.getSetCookie === "function"
			? authResult.headers.getSetCookie()
			: [];
	if (setCookies.length === 0) {
		authResult.headers.forEach((value, key) => {
			if (key.toLowerCase() === "set-cookie") {
				const parsed = parseSetCookieLine(value);
				if (parsed) cookieMap.set(parsed.name, parsed.value);
			}
		});
	} else {
		for (const line of setCookies) {
			const parsed = parseSetCookieLine(line);
			if (parsed) cookieMap.set(parsed.name, parsed.value);
		}
	}

	const merged = Array.from(cookieMap.entries())
		.map(([name, value]) => `${name}=${value}`)
		.join("; ");
	if (merged) {
		headers.set("cookie", merged);
	}
	return headers;
}

/** Safe detail string for logs (no secrets). */
export function oauthErrorDetail(error: unknown): string {
	if (error instanceof Error) {
		const parts = [error.message];
		const body = (error as { body?: unknown }).body;
		if (body && typeof body === "object") {
			const record = body as Record<string, unknown>;
			if (typeof record.error_description === "string") {
				parts.push(record.error_description);
			}
			if (typeof record.message === "string") {
				parts.push(record.message);
			}
		}
		return parts.join(" ").slice(0, 200);
	}
	if (error && typeof error === "object") {
		const record = error as Record<string, unknown>;
		if (typeof record.error_description === "string") {
			return record.error_description.slice(0, 200);
		}
	}
	return String(error).slice(0, 200);
}
