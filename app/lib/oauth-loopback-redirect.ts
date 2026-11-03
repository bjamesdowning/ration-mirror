/**
 * OAuth redirect URI matching (RFC 8252 §7.3 / §8.3, RFC 9700 §4.1.3).
 *
 * Exact string match is the default. A public client (token_endpoint_auth_method
 * "none", PKCE required) may additionally vary only the port on a loopback
 * redirect: scheme must be http, host one of 127.0.0.1, [::1] or localhost, and
 * path + query must equal the registered URI. Comparison uses parsed URLs,
 * never prefix or regex matching on the raw string.
 */

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);

function parseRedirect(uri: string): URL | null {
	// A trailing "#" defines an (empty) fragment that URL.hash hides.
	if (uri.includes("#")) return null;
	let url: URL;
	try {
		url = new URL(uri);
	} catch {
		return null;
	}
	if (url.username !== "" || url.password !== "") return null;
	return url;
}

/** True for http://127.0.0.1, http://[::1] or http://localhost (any port). */
export function isLoopbackHttpRedirect(uri: string): boolean {
	const url = parseRedirect(uri);
	return (
		url !== null &&
		url.protocol === "http:" &&
		LOOPBACK_HOSTS.has(url.hostname.toLowerCase())
	);
}

export function isPublicOAuthClient(
	tokenEndpointAuthMethod: string | null | undefined,
): boolean {
	return tokenEndpointAuthMethod === "none";
}

export function matchesRegisteredRedirectUri(
	requested: string,
	registered: readonly string[],
	options: { publicClient: boolean },
): boolean {
	const req = parseRedirect(requested);
	if (!req) return false;
	if (registered.includes(requested)) return true;
	if (!options.publicClient || !isLoopbackHttpRedirect(requested)) return false;

	return registered.some((candidate) => {
		if (!isLoopbackHttpRedirect(candidate)) return false;
		const reg = parseRedirect(candidate);
		if (!reg) return false;
		return (
			reg.protocol === req.protocol &&
			reg.hostname.toLowerCase() === req.hostname.toLowerCase() &&
			reg.pathname === req.pathname &&
			reg.search === req.search
		);
	});
}

export type OAuthRedirectClientRecord = {
	redirectUris: readonly string[] | null;
	tokenEndpointAuthMethod: string | null;
};

/**
 * Authorize-endpoint guard. Returns false when the requested redirect_uri is
 * not acceptable for that client (confidential clients: exact match only).
 * Unknown clients and missing params pass through so Better Auth returns its
 * own invalid_client / invalid_redirect errors.
 */
export async function isAuthorizeRedirectAllowed(
	query: Record<string, unknown> | undefined,
	lookupClient: (clientId: string) => Promise<OAuthRedirectClientRecord | null>,
): Promise<boolean> {
	const clientId = query?.client_id;
	const redirectUri = query?.redirect_uri;
	if (typeof clientId !== "string" || typeof redirectUri !== "string") {
		return true;
	}
	const client = await lookupClient(clientId);
	if (!client) return true;
	return matchesRegisteredRedirectUri(redirectUri, client.redirectUris ?? [], {
		publicClient: isPublicOAuthClient(client.tokenEndpointAuthMethod),
	});
}
