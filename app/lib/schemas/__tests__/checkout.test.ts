import { describe, expect, it } from "vitest";
import { CheckoutFormSchema } from "~/lib/schemas/checkout";

describe("CheckoutFormSchema", () => {
	it("accepts credit checkout with pack", () => {
		const result = CheckoutFormSchema.safeParse({
			type: "credits",
			pack: "SUPPLY_RUN",
			returnUrl: "/hub/checkout/return",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.type).toBe("credits");
			expect(result.data.pack).toBe("SUPPLY_RUN");
		}
	});

	it("accepts subscription checkout with subscription key", () => {
		const result = CheckoutFormSchema.safeParse({
			type: "subscription",
			subscription: "CREW_MEMBER_ANNUAL",
			returnUrl: "/hub/checkout/return",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.type).toBe("subscription");
			expect(result.data.subscription).toBe("CREW_MEMBER_ANNUAL");
		}
	});

	it("accepts tier checkout with subscription key", () => {
		const result = CheckoutFormSchema.safeParse({
			type: "tier",
			subscription: "CREW_MEMBER_MONTHLY",
			returnUrl: "/hub/settings",
		});
		expect(result.success).toBe(true);
	});

	it("defaults type to credits and returnUrl to /hub/checkout/return", () => {
		const result = CheckoutFormSchema.safeParse({
			pack: "TASTE_TEST",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.type).toBe("credits");
			expect(result.data.returnUrl).toBe("/hub/checkout/return");
		}
	});

	it("rejects credit checkout without pack", () => {
		const result = CheckoutFormSchema.safeParse({
			type: "credits",
			returnUrl: "/hub/checkout/return",
		});
		expect(result.success).toBe(false);
	});

	it("rejects subscription checkout without subscription key", () => {
		const result = CheckoutFormSchema.safeParse({
			type: "subscription",
			returnUrl: "/hub/checkout/return",
		});
		expect(result.success).toBe(false);
	});

	it("rejects returnUrl that does not start with /hub", () => {
		const result = CheckoutFormSchema.safeParse({
			type: "credits",
			pack: "SUPPLY_RUN",
			returnUrl: "/evil/redirect",
		});
		expect(result.success).toBe(false);
	});

	it("rejects invalid pack key", () => {
		const result = CheckoutFormSchema.safeParse({
			type: "credits",
			pack: "INVALID_PACK",
			returnUrl: "/hub/checkout/return",
		});
		expect(result.success).toBe(false);
	});

	it("rejects invalid subscription key", () => {
		const result = CheckoutFormSchema.safeParse({
			type: "subscription",
			subscription: "INVALID_SUB",
			returnUrl: "/hub/checkout/return",
		});
		expect(result.success).toBe(false);
	});
});
