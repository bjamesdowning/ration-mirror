import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedWidgetLayout } from "~/components/hub/widgets/registry";

const getSupplyList = vi.fn();
const getSupplyItemStats = vi.fn();
const getUserSettings = vi.fn();
const resolveLayout = vi.fn((): ResolvedWidgetLayout[] => []);
const getExpiringCargo = vi.fn(async () => []);
const getCargoStats = vi.fn(async () => ({
	totalItems: 0,
	expiringCount: 0,
	expiredCount: 0,
}));
const getManifestPreview = vi.fn(async () => null);
const getDistinctMealTags = vi.fn(async () => []);
const getOrganizationTagSlugs = vi.fn(async () => [] as string[]);
const getCargoTagIndex = vi.fn(async () => []);
const matchMeals = vi.fn(async () => []);
const getKitchenStats = vi.fn();
const getKitchenEvents = vi.fn();

vi.mock("~/components/hub/widgets/registry", () => ({
	resolveLayout: () => resolveLayout(),
}));

vi.mock("~/lib/auth.server", () => ({
	getUserSettings: () => getUserSettings(),
}));

vi.mock("~/lib/cargo.server", () => ({
	getExpiringCargo: () => getExpiringCargo(),
	getCargoStats: () => getCargoStats(),
}));

vi.mock("~/lib/tags.server", () => ({
	getOrganizationTagSlugs: () => getOrganizationTagSlugs(),
	getCargoTagIndex: () => getCargoTagIndex(),
}));

vi.mock("~/lib/manifest.server", () => ({
	getManifestPreview: () => getManifestPreview(),
	getDistinctMealTags: () => getDistinctMealTags(),
}));

vi.mock("~/lib/matching.server", () => ({
	matchMeals: () => matchMeals(),
	MEAL_MATCH_CANDIDATE_CAP: 200,
}));

vi.mock("~/lib/hub-match.server", () => ({
	getHubMealMatchWidgets: async () => ({
		mealMatches: [],
		partialMealMatches: [],
		snackMatches: [],
	}),
}));

vi.mock("~/lib/kitchen-events.server", () => ({
	getKitchenStats: () => getKitchenStats(),
	getKitchenEvents: () => getKitchenEvents(),
}));

vi.mock("~/lib/feature-flags/flags.server", () => ({
	buildMobileFlagContext: () => ({}),
}));

vi.mock("~/lib/nutrition/feature-policy.server", () => ({
	resolveNutritionCapabilities: async () => ({
		engine: false,
		manifest: false,
		cookLogSplit: false,
		goals: false,
		aiEstimate: false,
		asyncRecompute: false,
	}),
}));

vi.mock("~/lib/nutrition/hub-data.server", () => ({
	loadHubNutritionData: async () => ({
		nutritionToday: null,
		nutritionTrends: null,
	}),
}));

vi.mock("~/lib/logging.server", () => ({
	log: {
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		critical: vi.fn(),
		debug: vi.fn(),
	},
}));

vi.mock("~/lib/supply.server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("~/lib/supply.server")>();
	return {
		...actual,
		getSupplyList: (...args: unknown[]) => getSupplyList(...args),
		getSupplyItemStats: (...args: unknown[]) => getSupplyItemStats(...args),
	};
});

describe("getMobileHubData supply counts", () => {
	beforeEach(() => {
		getSupplyList.mockReset();
		getSupplyItemStats.mockReset();
		getDistinctMealTags.mockReset();
		getDistinctMealTags.mockResolvedValue([]);
		getOrganizationTagSlugs.mockReset();
		getOrganizationTagSlugs.mockResolvedValue([]);
		getCargoTagIndex.mockReset();
		getCargoTagIndex.mockResolvedValue([]);
		resolveLayout.mockReset();
		resolveLayout.mockReturnValue([]);
		getKitchenStats.mockReset();
		getKitchenStats.mockResolvedValue(null);
		getKitchenEvents.mockReset();
		getKitchenEvents.mockResolvedValue({ events: [], nextCursor: null });
	});

	it("untagged (common) case: fetches a bounded slice and gets counts from getSupplyItemStats", async () => {
		getUserSettings.mockResolvedValue({
			expirationAlertDays: 7,
			hubProfile: "default",
			hubLayout: null,
		});
		// The bounded fetch only ever returns up to the widget slice (20) —
		// counts must come from getSupplyItemStats, not from items.length.
		getSupplyList.mockResolvedValue({
			id: "list_1",
			name: "Supply",
			items: Array.from({ length: 20 }, (_, i) => ({
				id: `item_${i}`,
				name: `item ${i}`,
				quantity: 1,
				unit: "ea",
				domain: "food",
				isPurchased: i < 5,
			})),
		});
		getSupplyItemStats.mockResolvedValue({ itemCount: 25, purchasedCount: 5 });

		const { getMobileHubData } = await import("~/lib/mobile/hub.server");
		const result = await getMobileHubData(
			{ DB: {} } as never,
			"org_1",
			"user_1",
		);

		expect(getSupplyList).toHaveBeenCalledWith({}, "org_1", { limit: 20 });
		expect(getSupplyItemStats).toHaveBeenCalledWith({}, "list_1");
		expect(result.latestSupplyList?.items).toHaveLength(6);
		expect(result.latestSupplyList?.itemCount).toBe(25);
		expect(result.latestSupplyList?.purchasedCount).toBe(5);
		expect(result.latestSupplyList?.uncheckedCount).toBe(20);
	});

	it("returns null when no supply list exists yet and skips the stats query", async () => {
		getUserSettings.mockResolvedValue({
			expirationAlertDays: 7,
			hubProfile: "default",
			hubLayout: null,
		});
		getSupplyList.mockResolvedValue(null);

		const { getMobileHubData } = await import("~/lib/mobile/hub.server");
		const result = await getMobileHubData(
			{ DB: {} } as never,
			"org_1",
			"user_1",
		);

		expect(result.latestSupplyList).toBeNull();
		expect(getSupplyItemStats).not.toHaveBeenCalled();
	});

	it("returns Hub payload with empty tag fields when tag enrichment fails", async () => {
		getUserSettings.mockResolvedValue({
			expirationAlertDays: 7,
			hubProfile: "default",
			hubLayout: null,
		});
		getSupplyList.mockResolvedValue(null);
		getOrganizationTagSlugs.mockRejectedValue(
			new Error("too many bound parameters"),
		);
		getCargoTagIndex.mockRejectedValue(new Error("too many bound parameters"));
		getDistinctMealTags.mockRejectedValue(new Error("tag join failed"));

		const { getMobileHubData } = await import("~/lib/mobile/hub.server");
		const result = await getMobileHubData(
			{ DB: {} } as never,
			"org_1",
			"user_1",
		);

		expect(result.availableCargoTags).toEqual([]);
		expect(result.availableMealTags).toEqual([]);
		expect(result.cargoTagIndex).toEqual([]);
		expect(result.cargoStats).toEqual({
			totalItems: 0,
			expiringCount: 0,
			expiredCount: 0,
		});
	});

	it("returns flightRecorderActivity when the widget is visible", async () => {
		resolveLayout.mockReturnValue([
			{
				id: "flight-recorder",
				order: 0,
				visible: true,
			},
		]);
		getUserSettings.mockResolvedValue({
			expirationAlertDays: 7,
			hubProfile: "full",
			hubLayout: null,
		});
		getSupplyList.mockResolvedValue(null);
		getKitchenStats.mockResolvedValue({
			window: "7d",
			from: "2026-07-24T00:00:00.000Z",
			to: "2026-07-31T00:00:00.000Z",
			countsByType: { cargo_jettisoned: 2 },
			topCookedMeals: [],
			totals: { cooked: 0, docked: 0, expired: 0, jettisoned: 2 },
		});
		getKitchenEvents.mockResolvedValue({
			events: [
				{
					id: "evt-1",
					organizationId: "org_1",
					userId: null,
					eventType: "cargo_jettisoned",
					occurredAt: new Date("2026-07-30T12:00:00.000Z"),
					mealId: null,
					cargoId: null,
					subjectName: "Milk",
					payload: {},
				},
			],
			nextCursor: null,
		});

		const { getMobileHubData } = await import("~/lib/mobile/hub.server");
		const result = await getMobileHubData(
			{ DB: {} } as never,
			"org_1",
			"user_1",
		);

		expect(getKitchenStats).toHaveBeenCalled();
		expect(result.flightRecorderActivity?.stats.totals.jettisoned).toBe(2);
		expect(result.flightRecorderActivity?.recent[0]?.occurredAt).toBe(
			"2026-07-30T12:00:00.000Z",
		);
	});

	it("rethrows when cargoTagIndex fails and supply tag filters are active", async () => {
		resolveLayout.mockReturnValue([
			{
				id: "supply-preview",
				order: 0,
				visible: true,
				filters: { supplyTags: ["costco"], limit: 6 },
			},
		]);
		getUserSettings.mockResolvedValue({
			expirationAlertDays: 7,
			hubProfile: "default",
			hubLayout: null,
		});
		getSupplyList.mockResolvedValue({
			id: "list_1",
			name: "Supply",
			items: [{ id: "i1", name: "Milk", isPurchased: false }],
		});
		getCargoTagIndex.mockRejectedValue(new Error("cargo tag index failed"));

		const { getMobileHubData } = await import("~/lib/mobile/hub.server");
		await expect(
			getMobileHubData({ DB: {} } as never, "org_1", "user_1"),
		).rejects.toThrow("cargo tag index failed");
	});
});
