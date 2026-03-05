import { describe, expect, it } from "vitest";
import {
	type CheckoutFetcherData,
	shouldSyncCheckoutFromFetcher,
} from "~/lib/pricing-checkout";

describe("shouldSyncCheckoutFromFetcher", () => {
	it("returns false when fetcher data is undefined (e.g. after reset)", () => {
		expect(shouldSyncCheckoutFromFetcher(undefined, null)).toBe(false);
		expect(shouldSyncCheckoutFromFetcher(undefined, "cs_123")).toBe(false);
	});

	it("returns false when fetcher data has no success or clientSecret", () => {
		expect(shouldSyncCheckoutFromFetcher({}, null)).toBe(false);
		expect(shouldSyncCheckoutFromFetcher({ success: false }, null)).toBe(false);
		expect(
			shouldSyncCheckoutFromFetcher({ clientSecret: "cs_123" }, null),
		).toBe(false);
	});

	it("returns true when fetcher has new checkout data and current is null (opening)", () => {
		const data: CheckoutFetcherData = {
			success: true,
			clientSecret: "cs_new",
			sessionId: "sess_123",
		};
		expect(shouldSyncCheckoutFromFetcher(data, null)).toBe(true);
	});

	it("returns true when fetcher has different clientSecret (new session)", () => {
		const data: CheckoutFetcherData = {
			success: true,
			clientSecret: "cs_new",
		};
		expect(shouldSyncCheckoutFromFetcher(data, "cs_old")).toBe(true);
	});

	it("returns false when current already matches fetcher (already synced)", () => {
		const data: CheckoutFetcherData = {
			success: true,
			clientSecret: "cs_same",
		};
		expect(shouldSyncCheckoutFromFetcher(data, "cs_same")).toBe(false);
	});

	it("regression: returns false after close - fetcher reset clears data", () => {
		// After closeCheckout(): clientSecret=null, fetcher.reset() clears data.
		// Next render: fetcherData is undefined. We must NOT re-open.
		expect(shouldSyncCheckoutFromFetcher(undefined, null)).toBe(false);
	});
});
