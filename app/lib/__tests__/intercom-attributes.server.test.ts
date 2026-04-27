import { describe, expect, it, vi } from "vitest";
import type * as schema from "~/db/schema";
import { buildIntercomAttributes } from "../intercom-attributes.server";

// Mock capacity.server to control getEffectiveTier without DB
vi.mock("~/lib/capacity.server", () => ({
	getEffectiveTier: vi.fn(
		(tier: string, tierExpiresAt: unknown, now?: Date) => {
			if (tier === "crew_member") {
				const expiresAt =
					typeof tierExpiresAt === "number"
						? new Date(tierExpiresAt * 1000)
						: null;
				const isExpired =
					expiresAt !== null &&
					expiresAt.getTime() <= (now ?? new Date()).getTime();
				return { tier: isExpired ? "free" : "crew_member", isExpired };
			}
			return { tier: "free", isExpired: false };
		},
	),
	invalidateTierCache: vi.fn(),
}));

function makeDb(overrides?: {
	userRow?: {
		stripeCustomerId: string | null;
		subscriptionCancelAtPeriodEnd: boolean;
		crewSubscribedAt: Date | null;
	} | null;
	memberRow?: { role: string } | null;
}) {
	const userRow =
		overrides?.userRow !== undefined
			? overrides.userRow
			: {
					stripeCustomerId: null,
					subscriptionCancelAtPeriodEnd: false,
					crewSubscribedAt: null,
				};
	const memberRow =
		overrides?.memberRow !== undefined ? overrides.memberRow : null;

	return {
		query: {
			user: {
				findFirst: vi.fn().mockResolvedValue(userRow),
			},
			member: {
				findFirst: vi.fn().mockResolvedValue(memberRow),
			},
		},
	} as unknown as ReturnType<
		typeof import("drizzle-orm/d1").drizzle<typeof schema>
	>;
}

const baseUser = {
	id: "user-123",
	name: "Alice",
	email: "alice@example.com",
	createdAt: "2024-01-01T00:00:00.000Z",
	tier: "free" as const,
	tierExpiresAt: null,
	isAdmin: false,
	welcomeVoucherRedeemed: false,
	tosVersion: "2026-03-11",
};

describe("buildIntercomAttributes", () => {
	it("returns free tier attributes for a free user with no stripe customer", async () => {
		const db = makeDb();
		const attrs = await buildIntercomAttributes(db, baseUser, null);

		expect(attrs.tier).toBe("free");
		expect(attrs.tier_expired).toBe(false);
		expect(attrs.stripe_customer_id).toBeUndefined();
		expect(attrs.subscription_cancel_at_period_end).toBe(false);
		expect(attrs.is_admin).toBe(false);
		expect(attrs.welcome_voucher_redeemed).toBe(false);
		expect(attrs.tos_version).toBe("2026-03-11");
		expect(attrs.org_role).toBeUndefined();
		expect(attrs.tier_expires_at).toBeUndefined();
		expect(attrs.crew_subscribed_at).toBeUndefined();
		expect(attrs.credit_balance).toBeUndefined();
	});

	it("includes stripe_customer_id when the user has one", async () => {
		const db = makeDb({
			userRow: {
				stripeCustomerId: "cus_abc123",
				subscriptionCancelAtPeriodEnd: false,
				crewSubscribedAt: null,
			},
		});
		const attrs = await buildIntercomAttributes(db, baseUser, null);

		expect(attrs.stripe_customer_id).toBe("cus_abc123");
	});

	it("includes subscription_cancel_at_period_end when true", async () => {
		const db = makeDb({
			userRow: {
				stripeCustomerId: "cus_abc123",
				subscriptionCancelAtPeriodEnd: true,
				crewSubscribedAt: null,
			},
		});
		const attrs = await buildIntercomAttributes(db, baseUser, null);

		expect(attrs.subscription_cancel_at_period_end).toBe(true);
	});

	it("includes org_role when active org is set", async () => {
		const db = makeDb({ memberRow: { role: "owner" } });
		const attrs = await buildIntercomAttributes(db, baseUser, "org-abc");

		expect(attrs.org_role).toBe("owner");
		expect(db.query.member.findFirst).toHaveBeenCalled();
	});

	it("omits org_role when no active org is provided", async () => {
		const db = makeDb();
		const attrs = await buildIntercomAttributes(db, baseUser, null);

		expect(attrs.org_role).toBeUndefined();
		expect(db.query.member.findFirst).not.toHaveBeenCalled();
	});

	it("includes crew_member tier for an active subscriber", async () => {
		const futureExpiry = Math.floor(Date.now() / 1000) + 86400 * 30;
		const crewUser = {
			...baseUser,
			tier: "crew_member" as const,
			tierExpiresAt: futureExpiry,
		};
		const crewSubscribedAt = new Date("2025-01-01T00:00:00.000Z");
		const db = makeDb({
			userRow: {
				stripeCustomerId: "cus_crew",
				subscriptionCancelAtPeriodEnd: false,
				crewSubscribedAt,
			},
		});
		const attrs = await buildIntercomAttributes(db, crewUser, null);

		expect(attrs.tier).toBe("crew_member");
		expect(attrs.tier_expired).toBe(false);
		expect(attrs.tier_expires_at).toBe(futureExpiry);
		expect(attrs.crew_subscribed_at).toBe(
			Math.floor(crewSubscribedAt.getTime() / 1000),
		);
	});

	it("projects expired crew_member as free tier", async () => {
		const pastExpiry = Math.floor(Date.now() / 1000) - 86400;
		const expiredUser = {
			...baseUser,
			tier: "crew_member" as const,
			tierExpiresAt: pastExpiry,
		};
		const db = makeDb();
		const attrs = await buildIntercomAttributes(db, expiredUser, null);

		// getEffectiveTier mock returns "free" + isExpired:true for expired crew
		expect(attrs.tier).toBe("free");
		expect(attrs.tier_expired).toBe(true);
	});

	it("includes theme when provided in extras", async () => {
		const db = makeDb();
		const attrs = await buildIntercomAttributes(db, baseUser, null, {
			theme: "dark",
		});

		expect(attrs.theme).toBe("dark");
	});

	it("includes credit_balance when provided in extras", async () => {
		const db = makeDb();
		const attrs = await buildIntercomAttributes(db, baseUser, "org-abc", {
			creditBalance: 320,
		});

		expect(attrs.credit_balance).toBe(320);
	});

	it("omits theme when extras not provided", async () => {
		const db = makeDb();
		const attrs = await buildIntercomAttributes(db, baseUser, null);

		expect(attrs.theme).toBeUndefined();
	});

	it("includes is_admin:true for admin users", async () => {
		const adminUser = { ...baseUser, isAdmin: true };
		const db = makeDb();
		const attrs = await buildIntercomAttributes(db, adminUser, null);

		expect(attrs.is_admin).toBe(true);
	});

	it("omits tos_version when not set on session user", async () => {
		const userNoTos = { ...baseUser, tosVersion: null };
		const db = makeDb();
		const attrs = await buildIntercomAttributes(db, userNoTos, null);

		expect(attrs.tos_version).toBeUndefined();
	});

	it("skips member query when activeOrganizationId is null", async () => {
		const db = makeDb();
		await buildIntercomAttributes(db, baseUser, null);

		expect(db.query.member.findFirst).not.toHaveBeenCalled();
	});

	it("runs user and member queries in parallel", async () => {
		const callOrder: string[] = [];
		const userFindFirst = vi.fn().mockImplementation(() => {
			callOrder.push("user");
			return Promise.resolve({
				stripeCustomerId: null,
				subscriptionCancelAtPeriodEnd: false,
				crewSubscribedAt: null,
			});
		});
		const memberFindFirst = vi.fn().mockImplementation(() => {
			callOrder.push("member");
			return Promise.resolve({ role: "member" });
		});
		const db = {
			query: {
				user: { findFirst: userFindFirst },
				member: { findFirst: memberFindFirst },
			},
		} as unknown as ReturnType<
			typeof import("drizzle-orm/d1").drizzle<typeof schema>
		>;

		await buildIntercomAttributes(db, baseUser, "org-xyz");

		// Both queries should be invoked (order may vary in parallel execution)
		expect(callOrder).toContain("user");
		expect(callOrder).toContain("member");
	});
});
