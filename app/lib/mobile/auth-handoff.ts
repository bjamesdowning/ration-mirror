/** Single-use auth codes minted by `storeMobileAuthCode` are UUIDs. */
export const MOBILE_AUTH_CODE_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseMobileAuthCodeParam(raw: string | null): string | null {
	if (!raw || !MOBILE_AUTH_CODE_REGEX.test(raw)) return null;
	return raw;
}

export interface MobileAuthHandoffLinks {
	universalLink: string;
	customSchemeLink: string;
}

/** Builds Universal Link (primary) and custom-scheme (fallback) handoff URLs. */
export function mobileAuthHandoffLinks(
	baseUrl: string,
	code: string,
): MobileAuthHandoffLinks {
	const root = baseUrl.replace(/\/$/, "");
	const q = encodeURIComponent(code);
	return {
		universalLink: `${root}/auth/mobile-callback/open?code=${q}`,
		customSchemeLink: `ration://auth/callback?code=${q}`,
	};
}
