import { beforeEach, describe, expect, it, vi } from "vitest";

const processRevenueCatWebhookEvent = vi.fn();
const checkRevenueCatWebhookProcessed = vi.fn();
const clearRevenueCatWebhookProcessed = vi.fn();

vi.mock("~/lib/billing.server", () => ({
	processRevenueCatWebhookEvent: (...args: unknown[]) =>
		processRevenueCatWebhookEvent(...args),
}));

vi.mock("~/lib/billing-idempotency.server", () => ({
	checkRevenueCatWebhookProcessed: (...args: unknown[]) =>
		checkRevenueCatWebhookProcessed(...args),
	clearRevenueCatWebhookProcessed: (...args: unknown[]) =>
		clearRevenueCatWebhookProcessed(...args),
}));

vi.mock("~/lib/revenuecat.server", () => ({
	isRevenueCatFulfillmentEnabled: () => true,
	verifyRevenueCatWebhookAuth: () => true,
}));

const kv = {};
const ctx = {
	cloudflare: { env: { REVENUECAT_WEBHOOK_SECRET: "secret", RATION_KV: kv } },
} as never;

function cancellationRequest() {
	return new Request("https://ration.mayutic.com/api/webhook/revenuecat", {
		method: "POST",
		body: JSON.stringify({
			event: { type: "CANCELLATION", id: "evt_1", app_user_id: "user_1" },
		}),
	});
}

describe("POST /api/webhook/revenuecat", () => {
	beforeEach(() => {
		for (const m of [
			processRevenueCatWebhookEvent,
			checkRevenueCatWebhookProcessed,
			clearRevenueCatWebhookProcessed,
		]) {
			m.mockReset();
		}
		checkRevenueCatWebhookProcessed.mockResolvedValue({
			alreadyProcessed: false,
		});
		clearRevenueCatWebhookProcessed.mockResolvedValue(undefined);
	});

	it("clears the processed mark when processing throws so the retry runs", async () => {
		processRevenueCatWebhookEvent.mockRejectedValue(new Error("D1 down"));
		const { action } = await import("~/routes/api/webhook.revenuecat");
		const response = (await action({
			request: cancellationRequest(),
			context: ctx,
			params: {},
		} as never)) as Response;
		expect(response.status).toBe(500);
		expect(clearRevenueCatWebhookProcessed).toHaveBeenCalledWith(kv, "evt_1");
	});

	it("keeps the processed mark after a successful event", async () => {
		processRevenueCatWebhookEvent.mockResolvedValue({
			handled: true,
			fulfilled: true,
		});
		const { action } = await import("~/routes/api/webhook.revenuecat");
		const response = (await action({
			request: cancellationRequest(),
			context: ctx,
			params: {},
		} as never)) as Response;
		expect(response.status).toBe(200);
		expect(clearRevenueCatWebhookProcessed).not.toHaveBeenCalled();
	});
});
