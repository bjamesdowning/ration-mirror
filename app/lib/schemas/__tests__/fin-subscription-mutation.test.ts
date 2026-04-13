import { describe, expect, it } from "vitest";
import { FinSubscriptionMutationBodySchema } from "../fin-subscription-mutation";

describe("FinSubscriptionMutationBodySchema", () => {
	it("accepts user_id and confirm true", () => {
		const r = FinSubscriptionMutationBodySchema.safeParse({
			user_id: "abc-123",
			confirm: true,
		});
		expect(r.success).toBe(true);
	});

	it("rejects confirm false", () => {
		const r = FinSubscriptionMutationBodySchema.safeParse({
			user_id: "abc",
			confirm: false,
		});
		expect(r.success).toBe(false);
	});

	it("rejects user_id with whitespace", () => {
		const r = FinSubscriptionMutationBodySchema.safeParse({
			user_id: "bad id",
			confirm: true,
		});
		expect(r.success).toBe(false);
	});

	it("rejects missing confirm", () => {
		const r = FinSubscriptionMutationBodySchema.safeParse({
			user_id: "abc",
		});
		expect(r.success).toBe(false);
	});
});
