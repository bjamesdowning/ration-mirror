import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupplyList = vi.fn();
const getSupplyItemStats = vi.fn();
const getUserSettings = vi.fn();
const resolveLayout = vi.fn(() => []);
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
});
