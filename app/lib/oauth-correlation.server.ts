const OAUTH_CORRELATION_COOKIE = "ration_oauth_cid";
const OAUTH_CORRELATION_MAX_AGE_SEC = 600;

function cookieSuffix(secure: boolean): string {
	const secureFlag = secure ? "; Secure" : "";
	return `; Path=/; HttpOnly; SameSite=Lax${secureFlag}`;
}

/** Read or mint a short-lived correlation id for an OAuth browser flow. */
export function getOAuthCorrelationId(request: Request): string {
	const cookieHeader = request.headers.get("cookie") ?? "";
	for (const part of cookieHeader.split(";")) {
		const trimmed = part.trim();
		if (trimmed.startsWith(`${OAUTH_CORRELATION_COOKIE}=`)) {
			const value = trimmed.slice(OAUTH_CORRELATION_COOKIE.length + 1);
			if (value.length > 0 && value.length <= 64) {
				return value;
			}
		}
	}
	return crypto.randomUUID();
}

export function appendOAuthCorrelationCookie(
	headers: Headers,
	request: Request,
	correlationId: string,
): void {
	const secure = new URL(request.url).protocol === "https:";
	headers.append(
		"set-cookie",
		`${OAUTH_CORRELATION_COOKIE}=${correlationId}${cookieSuffix(secure)}; Max-Age=${OAUTH_CORRELATION_MAX_AGE_SEC}`,
	);
}

export function clearOAuthCorrelationCookie(
	headers: Headers,
	request: Request,
): void {
	const secure = new URL(request.url).protocol === "https:";
	headers.append(
		"set-cookie",
		`${OAUTH_CORRELATION_COOKIE}=${cookieSuffix(secure)}; Max-Age=0`,
	);
}
