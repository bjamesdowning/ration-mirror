/** Query params Better Auth puts on `/api/auth/magic-link/verify`. */
export const MAGIC_LINK_VERIFY_PARAMS = [
	"token",
	"callbackURL",
	"newUserCallbackURL",
	"errorCallbackURL",
] as const;

/**
 * Rewrites a Better Auth verify URL into our interstitial continue page.
 * Email scanners prefetch GET links; the continue page is inert until the user taps.
 */
export function magicLinkVerifyToContinueUrl(
	verifyUrl: string,
	siteOrigin: string,
): string {
	const parsed = new URL(verifyUrl);
	const root = siteOrigin.replace(/\/$/, "");
	const continueUrl = new URL(`${root}/auth/magic-link/continue`);
	for (const key of MAGIC_LINK_VERIFY_PARAMS) {
		const value = parsed.searchParams.get(key);
		if (value) continueUrl.searchParams.set(key, value);
	}
	return continueUrl.toString();
}

/** Reconstruct the Better Auth verify URL from interstitial query params. */
export function buildMagicLinkVerifyUrl(
	siteOrigin: string,
	params: URLSearchParams,
): string | null {
	const token = params.get("token");
	if (!token) return null;
	const root = siteOrigin.replace(/\/$/, "");
	const verifyUrl = new URL(`${root}/api/auth/magic-link/verify`);
	for (const key of MAGIC_LINK_VERIFY_PARAMS) {
		const value = params.get(key);
		if (value) verifyUrl.searchParams.set(key, value);
	}
	return verifyUrl.toString();
}
