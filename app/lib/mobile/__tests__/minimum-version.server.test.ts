import { describe, expect, it } from "vitest";
import { APP_STORE_URL } from "~/lib/marketing";
import {
	mobileUpgradeRequiredResponse,
	UPGRADE_REQUIRED_CODE,
	UPGRADE_REQUIRED_MESSAGE,
} from "../minimum-version.server";

function mobileRequest(path: string, client?: string): Request {
	const headers = new Headers();
	if (client) headers.set("X-Ration-Client", client);
	return new Request(`https://ration.mayutic.com/api/mobile/v1/${path}`, {
		headers,
	});
}

describe("mobileUpgradeRequiredResponse", () => {
	it("returns 426 with the App Store link for an older iOS build", async () => {
		const response = mobileUpgradeRequiredResponse(
			mobileRequest("hub", "ios/1.4.31"),
			"1.5.11",
		);
		expect(response?.status).toBe(426);
		expect(await response?.json()).toEqual({
			error: UPGRADE_REQUIRED_MESSAGE,
			code: UPGRADE_REQUIRED_CODE,
			minimumVersion: "1.5.11",
			appStoreUrl: APP_STORE_URL,
		});
	});

	it("lets the minimum version and newer builds through", () => {
		for (const version of ["1.5.11", "1.5.12", "1.6", "2.0.0"]) {
			expect(
				mobileUpgradeRequiredResponse(
					mobileRequest("hub", `ios/${version}`),
					"1.5.11",
				),
			).toBeNull();
		}
	});

	it("keeps start-up, sign-out, and account deletion routes open", () => {
		for (const path of [
			"session",
			"settings",
			"client-flags",
			"account",
			"auth/token",
			"auth/session",
		]) {
			expect(
				mobileUpgradeRequiredResponse(
					mobileRequest(path, "ios/1.4.31"),
					"1.5.11",
				),
			).toBeNull();
		}
	});

	it("ignores requests it cannot attribute to an iOS version", () => {
		const minimum = "1.5.11";
		expect(
			mobileUpgradeRequiredResponse(mobileRequest("hub"), minimum),
		).toBeNull();
		expect(
			mobileUpgradeRequiredResponse(
				mobileRequest("hub", "ios/unknown"),
				minimum,
			),
		).toBeNull();
		expect(
			mobileUpgradeRequiredResponse(mobileRequest("hub", "web/1.0.0"), minimum),
		).toBeNull();
	});

	it("only applies to the mobile API and is off without a minimum", () => {
		const web = new Request("https://ration.mayutic.com/hub", {
			headers: { "X-Ration-Client": "ios/1.4.31" },
		});
		expect(mobileUpgradeRequiredResponse(web, "1.5.11")).toBeNull();
		expect(
			mobileUpgradeRequiredResponse(mobileRequest("hub", "ios/1.0"), ""),
		).toBeNull();
		expect(
			mobileUpgradeRequiredResponse(mobileRequest("hub", "ios/1.0"), undefined),
		).toBeNull();
	});
});
