import { describe, expect, it } from "vitest";
import { mobileConsentMetadata } from "../consent-metadata";

describe("mobileConsentMetadata", () => {
	it("records the iOS version from X-Ration-Client and the primary locale", () => {
		const request = new Request("https://example.test", {
			headers: {
				"X-Ration-Client": "ios/1.5.11",
				"Accept-Language": "en-GB,en;q=0.9",
			},
		});
		expect(mobileConsentMetadata(request)).toEqual({
			clientVersion: "1.5.11",
			locale: "en-GB",
		});
	});

	it("returns nulls when the headers are missing", () => {
		expect(mobileConsentMetadata(new Request("https://example.test"))).toEqual({
			clientVersion: null,
			locale: null,
		});
	});
});
