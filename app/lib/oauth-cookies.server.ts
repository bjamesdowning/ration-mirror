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
