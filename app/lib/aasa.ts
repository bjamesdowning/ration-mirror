/**
 * Apple App Site Association (AASA) builder for Universal Links.
 *
 * Served at `/.well-known/apple-app-site-association`. Apple fetches this to
 * verify domain ownership before routing matching https paths into the app.
 *
 * The app ID is `<TeamID>.<BundleID>`. The Team ID is not a secret — it is the
 * same value committed in `ios/project.yml` (`DEVELOPMENT_TEAM`). The bundle ID
 * is `com.mayutic.ration`.
 */

/** Apple Developer Team ID — mirrors `DEVELOPMENT_TEAM` in `ios/project.yml`. */
export const IOS_TEAM_ID = "M2KJH5GDGH";

/** Production bundle identifier — mirrors `PRODUCT_BUNDLE_IDENTIFIER`. */
export const IOS_BUNDLE_ID = "com.mayutic.ration";

/**
 * Universal Link paths handed off to the app. Only the dedicated auth handoff
 * path is associated so the human-readable `/auth/mobile-callback` page itself
 * always renders in Safari (it is reached via a server 302, which never triggers
 * a Universal Link); the in-page button taps `/auth/mobile-callback/open`, which
 * is a user gesture that does fire the Universal Link.
 */
export const AASA_APPLINK_PATHS = ["/auth/mobile-callback/open"];

export interface AppleAppSiteAssociation {
	applinks: {
		apps: string[];
		details: Array<{ appID: string; paths: string[] }>;
	};
}

export function buildAppleAppSiteAssociation(
	teamId: string = IOS_TEAM_ID,
	bundleId: string = IOS_BUNDLE_ID,
	paths: string[] = AASA_APPLINK_PATHS,
): AppleAppSiteAssociation {
	return {
		applinks: {
			apps: [],
			details: [
				{
					appID: `${teamId}.${bundleId}`,
					paths,
				},
			],
		},
	};
}
