import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildKitchenSummary } from "~/lib/agent/kitchen-summary.server";

vi.mock("~/lib/auth.server", () => ({
	getUserSettings: vi.fn().mockResolvedValue({ expirationAlertDays: 7 }),
}));

vi.mock("~/lib/agent/kitchen-snapshot.server", () => ({
	getAgentKitchenSnapshot: vi.fn().mockResolvedValue({
		tier: "free",
		tierExpired: false,
		credits: 12,
		capacity: {
			cargo: { current: 5, limit: 35, canAdd: 30 },
			meals: { current: 2, limit: 15, canAdd: 13 },
			supplyLists: { current: 1, limit: 3, canAdd: 2 },
		},
		lastActivityAt: null,
		limits: {
			maxInventoryItems: 35,
			maxMeals: 15,
			maxGroceryLists: 3,
		},
	}),
}));

vi.mock("~/lib/cargo.server", () => ({
	getExpiringCargo: vi.fn().mockResolvedValue([
		{
			id: "c1",
			name: "milk",
			quantity: 1,
			unit: "l",
			expiresAt: new Date("2026-07-13T00:00:00.000Z"),
		},
	]),
	getExpiredCargo: vi.fn().mockResolvedValue([]),
	getCargoStats: vi.fn().mockResolvedValue({
		totalItems: 5,
		expiringCount: 1,
		expiredCount: 0,
	}),
}));

vi.mock("~/lib/manifest.server", () => ({
	getManifestPreview: vi.fn().mockResolvedValue({
		planId: "plan-1",
		entries: [
			{
				entryId: "e1",
				date: "2026-07-13",
				slotType: "dinner",
				mealName: "Pasta",
				mealId: "m1",
				servingsOverride: 2,
			},
		],
	}),
}));

vi.mock("~/lib/supply.server", () => ({
	getSupplyList: vi.fn().mockResolvedValue({
		id: "list-1",
		name: "Weekly shop",
		items: [
			{
				id: "s1",
				name: "bread",
				quantity: 1,
				unit: "loaf",
				isPurchased: false,
			},
		],
	}),
	getSupplyItemStats: vi.fn().mockResolvedValue({
		itemCount: 3,
		purchasedCount: 1,
	}),
}));

describe("buildKitchenSummary", () => {
	const env = { DB: {} as D1Database } as Cloudflare.Env;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-13T12:00:00.000Z"));
	});

	it("aggregates cargo, manifest, supply, and kitchen snapshot", async () => {
		const summary = await buildKitchenSummary(env, "org-1", "user-1", {
			manifestDays: 1,
		});

		expect(summary.temporal.todayUtc).toBe("2026-07-13");
		expect(summary.mealPlan.startDate).toBe(summary.temporal.todayUtc);
		expect(summary.temporal.expirationAlertDays).toBe(7);
		expect(summary.kitchen.credits).toBe(12);
		expect(summary.cargo.stats.totalItems).toBe(5);
		expect(summary.cargo.expiringSoon).toHaveLength(1);
		expect(summary.cargo.expiringSoon[0]?.status).toBe("today");
		expect(summary.cargo.expiredTotal).toBe(summary.cargo.stats.expiredCount);
		expect(summary.cargo.expiredRecentlyLookbackDays).toBe(30);
		expect(summary.mealPlan.entries).toHaveLength(1);
		expect(summary.mealPlan.entries[0]?.servings).toBe(2);
		expect(summary.mealPlan.entries[0]?.status).toBe("planned");
		expect(summary.mealPlan.entries[0]).not.toHaveProperty("loggedByYou");
		expect(summary.supply?.uncheckedCount).toBe(2);
		expect(summary.supply?.preview[0]?.name).toBe("bread");
	});

	it("uses meal servings when the slot has no override and reports cooked", async () => {
		const { getManifestPreview } = await import("~/lib/manifest.server");
		vi.mocked(getManifestPreview).mockResolvedValueOnce({
			planId: "plan-1",
			entries: [
				{
					entryId: "e2",
					date: "2026-07-13",
					slotType: "dinner",
					mealName: "Soup",
					mealId: "m2",
					servingsOverride: null,
					mealServings: 4,
					consumedAt: new Date("2026-07-13T18:00:00.000Z"),
					cookedAt: new Date("2026-07-13T17:00:00.000Z"),
				},
			],
		});
		const summary = await buildKitchenSummary(env, "org-1", "user-1");
		expect(summary.mealPlan.entries[0]).toMatchObject({
			servings: 4,
			status: "cooked",
			cookedAt: "2026-07-13T17:00:00.000Z",
			consumedAt: "2026-07-13T18:00:00.000Z",
		});
		expect(summary.mealPlan.entries[0]).not.toHaveProperty("loggedByYou");
		expect(getManifestPreview).toHaveBeenCalledWith(
			expect.anything(),
			"org-1",
			1,
			undefined,
			undefined,
			expect.objectContaining({ includeSlotState: true }),
		);
	});

	it("treats a legacy consumedAt dual-write as cooked, not eaten", async () => {
		const { getManifestPreview } = await import("~/lib/manifest.server");
		vi.mocked(getManifestPreview).mockResolvedValueOnce({
			planId: "plan-1",
			entries: [
				{
					entryId: "e3",
					date: "2026-07-13",
					slotType: "lunch",
					mealName: "Rice",
					mealId: "m3",
					servingsOverride: 1,
					consumedAt: new Date("2026-07-13T18:00:00.000Z"),
					cookedAt: null,
				},
			],
		});
		const summary = await buildKitchenSummary(env, "org-1", "user-1");
		expect(summary.mealPlan.entries[0]).toMatchObject({
			status: "cooked",
			cookedAt: null,
			consumedAt: "2026-07-13T18:00:00.000Z",
		});
		expect(summary.mealPlan.entries[0]).not.toHaveProperty("loggedByYou");
	});

	it("emits loggedByYou false after cook and true after the caller logs intake", async () => {
		const { getManifestPreview } = await import("~/lib/manifest.server");
		const cookedEntry = {
			entryId: "e2",
			date: "2026-07-13",
			slotType: "dinner",
			mealName: "Soup",
			mealId: "m2",
			servingsOverride: null,
			mealServings: 4,
			consumedAt: new Date("2026-07-13T18:00:00.000Z"),
			cookedAt: new Date("2026-07-13T18:00:00.000Z"),
		};
		vi.mocked(getManifestPreview).mockResolvedValue({
			planId: "plan-1",
			entries: [cookedEntry],
		});

		const beforeIntake = await buildKitchenSummary(env, "org-1", "user-1", {
			loggedByYouForEntries: async () => new Map(),
		});
		expect(beforeIntake.mealPlan.entries[0]).toMatchObject({
			status: "cooked",
			cookedAt: "2026-07-13T18:00:00.000Z",
			consumedAt: "2026-07-13T18:00:00.000Z",
			loggedByYou: false,
		});

		const afterIntake = await buildKitchenSummary(env, "org-1", "user-1", {
			loggedByYouForEntries: async () => new Map([["e2", true]]),
		});
		expect(afterIntake.mealPlan.entries[0]).toMatchObject({
			status: "cooked",
			loggedByYou: true,
		});
	});

	it("omits loggedByYou when the intake read has no consent", async () => {
		const { getManifestPreview } = await import("~/lib/manifest.server");
		vi.mocked(getManifestPreview).mockResolvedValueOnce({
			planId: "plan-1",
			entries: [
				{
					entryId: "e2",
					date: "2026-07-13",
					slotType: "dinner",
					mealName: "Soup",
					mealId: "m2",
					consumedAt: new Date("2026-07-13T18:00:00.000Z"),
					cookedAt: new Date("2026-07-13T18:00:00.000Z"),
				},
			],
		});
		const summary = await buildKitchenSummary(env, "org-1", "user-1", {
			loggedByYouForEntries: async () => null,
		});
		expect(summary.mealPlan.entries[0]?.status).toBe("cooked");
		expect(summary.mealPlan.entries[0]).not.toHaveProperty("loggedByYou");
	});
});
