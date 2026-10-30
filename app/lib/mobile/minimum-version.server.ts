import { compareVersions } from "~/lib/client-version";
import { parseRationClientHeader } from "~/lib/feature-flags/context.server";
import { APP_STORE_URL } from "~/lib/marketing";

export const UPGRADE_REQUIRED_CODE = "upgrade_required";

export const UPGRADE_REQUIRED_MESSAGE =
	"This version of Ration is no longer supported. Update Ration from the App Store to keep going. If your iPhone can't run iOS 26, use ration.mayutic.com in Safari.";

const MOBILE_API_PREFIX = "/api/mobile/v1/";

/**
 * A build below the minimum still needs these to start up, show the update
 * message on its tabs, sign out, and delete the account.
 */
const EXEMPT_ROUTES = new Set([
	"session",
	"settings",
	"client-flags",
	"account",
]);

function isExemptRoute(route: string): boolean {
	return EXEMPT_ROUTES.has(route) || route.startsWith("auth/");
}

/**
 * 426 for iOS builds older than `IOS_MIN_SUPPORTED_VERSION`. Requests without
 * an `ios/<version>` client header, or with an unparsable version, pass.
 */
export function mobileUpgradeRequiredResponse(
	request: Request,
	minimumVersion: string | undefined,
): Response | null {
	const minimum = minimumVersion?.trim();
	if (!minimum) return null;

	const { pathname } = new URL(request.url);
	if (!pathname.startsWith(MOBILE_API_PREFIX)) return null;
	if (isExemptRoute(pathname.slice(MOBILE_API_PREFIX.length))) return null;

	const client = parseRationClientHeader(
		request.headers.get("X-Ration-Client"),
	);
	if (client.clientPlatform !== "ios" || !client.clientVersion) return null;
	if (compareVersions(client.clientVersion, minimum) !== -1) return null;

	return Response.json(
		{
			error: UPGRADE_REQUIRED_MESSAGE,
			code: UPGRADE_REQUIRED_CODE,
			minimumVersion: minimum,
			appStoreUrl: APP_STORE_URL,
		},
		{ status: 426 },
	);
}
