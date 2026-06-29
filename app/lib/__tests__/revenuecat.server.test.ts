import { describe, expect, it } from "vitest";
import {
	isRevenueCatFulfillmentEnabled,
	verifyRevenueCatWebhookAuth,
} from "~/lib/revenuecat.server";
import { createMockEnv } from "~/test/helpers/mock-env";

describe("verifyRevenueCatWebhookAuth", () => {
	it("accepts matching bearer token", () => {
		const env = createMockEnv();
		env.REVENUECAT_WEBHOOK_SECRET = "whsec_rc_test";
		const request = new Request("https://example.com/webhook", {
			headers: { Authorization: "Bearer whsec_rc_test" },
		});
		expect(verifyRevenueCatWebhookAuth(request, env)).toBe(true);
	});

	it("rejects missing or wrong token", () => {
		const env = createMockEnv();
		env.REVENUECAT_WEBHOOK_SECRET = "whsec_rc_test";
		const request = new Request("https://example.com/webhook");
		expect(verifyRevenueCatWebhookAuth(request, env)).toBe(false);
	});
});

describe("isRevenueCatFulfillmentEnabled", () => {
	it("defaults to false", () => {
		const env = createMockEnv();
		expect(isRevenueCatFulfillmentEnabled(env)).toBe(false);
	});

	it("is true only when env var is the string true", () => {
		const env = createMockEnv();
		env.REVENUECAT_FULFILLMENT_ENABLED = "true";
		expect(isRevenueCatFulfillmentEnabled(env)).toBe(true);
	});
});
