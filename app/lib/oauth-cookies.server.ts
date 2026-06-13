import { OAUTH_ORG_SELECTED_COOKIE } from "./oauth.constants";

const OAUTH_ORG_SELECTED_MAX_AGE_SEC = 600;

/** True when the user confirmed a household on select-org in this OAuth flow. */
export function hasOAuthOrgSelectedCookie(
	cookieHeader: string | null | undefined,
): boolean {
	if (!cookieHeader) {
		return false;
	}
	for (const part of cookieHeader.split(";")) {
		const trimmed = part.trim();
		if (trimmed === `${OAUTH_ORG_SELECTED_COOKIE}=1`) {
			return true;
		}
	}
	return false;
}

/** Remove the org-selected marker so a fresh authorize cannot skip household pick. */
export function stripOAuthOrgSelectedFromCookieHeader(
	cookieHeader: string,
): string {
	const parts = cookieHeader
		.split(";")
		.map((part) => part.trim())
		.filter(
			(part) =>
				part.length > 0 && !part.startsWith(`${OAUTH_ORG_SELECTED_COOKIE}=`),
		);
	return parts.join("; ");
}

/** Attach org-selected to Cookie for internal Better Auth oauth2/continue calls. */
export function mergeOAuthOrgSelectedIntoHeaders(headers: Headers): void {
	const existing = headers.get("cookie") ?? "";
	const marker = `${OAUTH_ORG_SELECTED_COOKIE}=1`;
	const merged = existing ? `${existing}; ${marker}` : marker;
	headers.set("cookie", merged);
}

function cookieSuffix(secure: boolean): string {
	const secureFlag = secure ? "; Secure" : "";
	return `; Path=/; HttpOnly; SameSite=Lax${secureFlag}`;
}

export function appendOAuthOrgSelectedCookie(
	headers: Headers,
	request: Request,
): void {
	const secure = new URL(request.url).protocol === "https:";
	headers.append(
		"set-cookie",
		`${OAUTH_ORG_SELECTED_COOKIE}=1${cookieSuffix(secure)}; Max-Age=${OAUTH_ORG_SELECTED_MAX_AGE_SEC}`,
	);
}

export function appendClearOAuthOrgSelectedCookie(
	headers: Headers,
	request: Request,
): void {
	const secure = new URL(request.url).protocol === "https:";
	headers.append(
		"set-cookie",
		`${OAUTH_ORG_SELECTED_COOKIE}=${cookieSuffix(secure)}; Max-Age=0`,
	);
}
