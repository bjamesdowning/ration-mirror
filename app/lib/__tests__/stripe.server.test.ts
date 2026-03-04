import { describe, expect, it, vi } from "vitest";
import type * as schema from "~/db/schema";
import { getOrCreateStripeCustomer } from "~/lib/stripe.server";
import { createMockEnv } from "~/test/helpers/mock-env";

// Mock Stripe SDK to avoid real API calls
vi.mock("stripe", () => {
	const mockCustomersCreate = vi.fn().mockResolvedValue({ id: "cus_new123" });
	class MockStripe {
		customers = { create: mockCustomersCreate };
		static createFetchHttpClient = () => undefined;
	}
	return { default: MockStripe };
});

function createMockDb(
	overrides: {
		findFirstResults?: Array<{ stripeCustomerId: string | null } | null>;
	} = {},
) {
	const {
		findFirstResults = [
			{ stripeCustomerId: null },
			{ stripeCustomerId: "cus_new123" },
		],
	} = overrides;
	const findFirst = vi.fn();
	for (const r of findFirstResults) {
		findFirst.mockResolvedValueOnce(r);
	}
	findFirst.mockResolvedValue(
		findFirstResults[findFirstResults.length - 1] ?? null,
	);

	const where = vi.fn().mockResolvedValue(undefined);
	const set = vi.fn().mockReturnValue({ where });
	const update = vi.fn().mockReturnValue({ set });

	return {
		query: {
			user: {
				findFirst,
			},
		},
		update,
	} as unknown as ReturnType<
		typeof import("drizzle-orm/d1").drizzle<typeof schema>
	>;
}

describe("getOrCreateStripeCustomer", () => {
	it("returns existing stripeCustomerId when user has one", async () => {
		const env = createMockEnv();
		const db = createMockDb({
			findFirstResults: [{ stripeCustomerId: "cus_existing456" }],
		});

		const result = await getOrCreateStripeCustomer(
			env,
			db,
			"user-1",
			"test@example.com",
		);

		expect(result).toBe("cus_existing456");
		expect(db.update).not.toHaveBeenCalled();
	});

	it("creates Stripe customer and saves to DB when user has no stripeCustomerId", async () => {
		const env = createMockEnv();
		const db = createMockDb({
			findFirstResults: [
				{ stripeCustomerId: null },
				{ stripeCustomerId: "cus_new123" },
			],
		});

		const result = await getOrCreateStripeCustomer(
			env,
			db,
			"user-2",
			"new@example.com",
		);

		expect(result).toBe("cus_new123");
		expect(db.update).toHaveBeenCalled();
	});
});
