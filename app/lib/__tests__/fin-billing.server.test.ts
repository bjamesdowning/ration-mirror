import { describe, expect, it } from "vitest";
import {
	buildFinIdempotencyKey,
	pickBestMutableSubscription,
	pickBestSubscription,
	planNameFromSubscription,
	type StripeSubscriptionShape,
	toIsoDateOrNull,
} from "../fin-billing.server";

describe("pickBestSubscription", () => {
	it("prefers active over past_due", () => {
		const subs: StripeSubscriptionShape[] = [
			{ id: "sub_past", status: "past_due" },
			{ id: "sub_active", status: "active" },
		];
		expect(pickBestSubscription(subs)?.id).toBe("sub_active");
	});

	it("does not mutate the input array order", () => {
		const subs: StripeSubscriptionShape[] = [
			{ id: "a", status: "active" },
			{ id: "b", status: "canceled" },
		];
		const copy = [...subs];
		pickBestSubscription(subs);
		expect(subs).toEqual(copy);
	});
});

describe("pickBestMutableSubscription", () => {
	it("excludes canceled subscriptions", () => {
		const subs: StripeSubscriptionShape[] = [
			{ id: "sub_x", status: "canceled" },
			{ id: "sub_y", status: "active" },
		];
		expect(pickBestMutableSubscription(subs)?.id).toBe("sub_y");
	});

	it("returns null when only canceled remains", () => {
		const subs: StripeSubscriptionShape[] = [
			{ id: "sub_x", status: "canceled" },
		];
		expect(pickBestMutableSubscription(subs)).toBeNull();
	});

	it("includes past_due when present", () => {
		const subs: StripeSubscriptionShape[] = [
			{ id: "sub_pd", status: "past_due" },
		];
		expect(pickBestMutableSubscription(subs)?.id).toBe("sub_pd");
	});
});

describe("buildFinIdempotencyKey", () => {
	it("truncates to 255 characters", () => {
		const longId = "u".repeat(300);
		const key = buildFinIdempotencyKey("cancel", longId, "sub_123", true);
		expect(key.length).toBe(255);
	});
});

describe("toIsoDateOrNull", () => {
	it("returns null for invalid input", () => {
		expect(toIsoDateOrNull(undefined)).toBeNull();
		expect(toIsoDateOrNull(Number.NaN)).toBeNull();
	});

	it("converts unix seconds to ISO string", () => {
		expect(toIsoDateOrNull(1_700_000_000)).toBe(
			new Date(1_700_000_000 * 1000).toISOString(),
		);
	});
});

describe("planNameFromSubscription", () => {
	it("uses nickname when present", () => {
		const sub: StripeSubscriptionShape = {
			id: "sub_1",
			status: "active",
			items: {
				data: [{ price: { nickname: "Crew Monthly", product: "prod_x" } }],
			},
		};
		expect(planNameFromSubscription(sub)).toBe("Crew Monthly");
	});

	it("falls back to product name object", () => {
		const sub: StripeSubscriptionShape = {
			id: "sub_1",
			status: "active",
			items: {
				data: [
					{
						price: {
							product: { name: "Crew Member" },
						},
					},
				],
			},
		};
		expect(planNameFromSubscription(sub)).toBe("Crew Member");
	});
});
