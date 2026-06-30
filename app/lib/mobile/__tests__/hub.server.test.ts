import { describe, expect, it, vi } from "vitest";

const getSupplyList = vi.fn();
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

vi.mock("~/lib/manifest.server", () => ({
	getManifestPreview: () => getManifestPreview(),
	getDistinctMealTags: () => getDistinctMealTags(),
}));

vi.mock("~/lib/matching.server", () => ({
	matchMeals: () => matchMeals(),
}));

vi.mock("~/lib/supply.server", () => ({
	getSupplyList: () => getSupplyList(),
}));

describe("getMobileHubData supply counts", () => {
	it("includes full-list counts when items are sliced", async () => {
		getUserSettings.mockResolvedValue({
			expirationAlertDays: 7,
			hubProfile: "default",
			hubLayout: null,
		});
		getSupplyList.mockResolvedValue({
			id: "list_1",
			name: "Supply",
			items: Array.from({ length: 25 }, (_, i) => ({
				id: `item_${i}`,
				name: `item ${i}`,
				quantity: 1,
				unit: "ea",
				domain: "food",
				isPurchased: i < 5,
			})),
		});

		const { getMobileHubData } = await import("~/lib/mobile/hub.server");
		const result = await getMobileHubData(
			{ DB: {} } as never,
			"org_1",
			"user_1",
		);

		expect(result.latestSupplyList?.items).toHaveLength(20);
		expect(result.latestSupplyList?.itemCount).toBe(25);
		expect(result.latestSupplyList?.purchasedCount).toBe(5);
		expect(result.latestSupplyList?.uncheckedCount).toBe(20);
	});
});
