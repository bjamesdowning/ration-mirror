import { describe, expect, it } from "vitest";
import {
	AASA_APPLINK_PATHS,
	buildAppleAppSiteAssociation,
	IOS_BUNDLE_ID,
	IOS_TEAM_ID,
} from "../aasa";

describe("buildAppleAppSiteAssociation", () => {
	it("emits a single app detail with <team>.<bundle> appID", () => {
		const aasa = buildAppleAppSiteAssociation();
		expect(aasa.applinks.apps).toEqual([]);
		expect(aasa.applinks.details).toHaveLength(1);
		expect(aasa.applinks.details[0].appID).toBe(
			`${IOS_TEAM_ID}.${IOS_BUNDLE_ID}`,
		);
	});

	it("does not contain the TEAMID placeholder", () => {
		const aasa = buildAppleAppSiteAssociation();
		expect(aasa.applinks.details[0].appID).not.toContain("TEAMID");
	});

	it("associates only the dedicated auth handoff path", () => {
		const aasa = buildAppleAppSiteAssociation();
		expect(aasa.applinks.details[0].paths).toEqual(AASA_APPLINK_PATHS);
		expect(aasa.applinks.details[0].paths).toContain(
			"/auth/mobile-callback/open",
		);
	});

	it("allows overrides for testing/staging app IDs", () => {
		const aasa = buildAppleAppSiteAssociation("TEAM2", "com.example.app", [
			"/x",
		]);
		expect(aasa.applinks.details[0]).toEqual({
			appID: "TEAM2.com.example.app",
			paths: ["/x"],
		});
	});
});
