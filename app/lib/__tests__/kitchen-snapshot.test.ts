import { describe, expect, it } from "vitest";
import type { AgentKitchenSnapshot } from "~/lib/agent/kitchen-snapshot.server";
import { pickLatestActivityIso } from "~/lib/agent/kitchen-snapshot.server";
import { buildKitchenAwareSuggestedActions } from "~/lib/agent/suggested-actions.server";

describe("pickLatestActivityIso", () => {
	it("returns the newest ISO timestamp", () => {
		expect(
			pickLatestActivityIso([
				new Date("2026-03-01T00:00:00.000Z"),
				new Date("2026-06-15T12:00:00.000Z"),
				null,
			]),
		).toBe("2026-06-15T12:00:00.000Z");
	});

	it("returns null when no candidates exist", () => {
		expect(pickLatestActivityIso([null, undefined])).toBeNull();
	});
});

const emptyKitchen = (): AgentKitchenSnapshot => ({
	tier: "free",
	tierExpired: false,
	limits: {
		maxInventoryItems: 35,
		maxMeals: 15,
		maxGroceryLists: 3,
	},
	capacity: {
		cargo: { current: 0, limit: 35, canAdd: 35 },
		meals: { current: 0, limit: 15, canAdd: 15 },
		supplyLists: { current: 0, limit: 3, canAdd: 3 },
	},
	credits: 0,
	lastActivityAt: null,
});

describe("buildKitchenAwareSuggestedActions", () => {
	it("suggests seeding inventory when cargo is empty", () => {
		const actions = buildKitchenAwareSuggestedActions(
			{
				claimed: true,
				status: "claimed",
				claimUrlAvailable: false,
				preClaim: false,
			},
			{
				canRead: true,
				canWriteInventory: true,
				canWriteGalley: false,
				canWriteManifest: false,
				canWriteSupply: false,
				canWritePreferences: false,
			},
			emptyKitchen(),
		);
		expect(actions.some((a) => a.action === "seed_inventory")).toBe(true);
		expect(actions.some((a) => a.action === "credits_depleted")).toBe(true);
	});

	it("suggests cargo_at_limit when tier cap is reached", () => {
		const kitchen = emptyKitchen();
		kitchen.capacity.cargo = { current: 35, limit: 35, canAdd: 0 };
		const actions = buildKitchenAwareSuggestedActions(
			{
				claimed: true,
				status: "claimed",
				claimUrlAvailable: false,
				preClaim: false,
			},
			{
				canRead: true,
				canWriteInventory: true,
				canWriteGalley: false,
				canWriteManifest: false,
				canWriteSupply: false,
				canWritePreferences: false,
			},
			kitchen,
		);
		expect(actions.some((a) => a.action === "cargo_at_limit")).toBe(true);
	});

	it("does not suggest seed_inventory when crew tier has stocked cargo", () => {
		const kitchen = emptyKitchen();
		kitchen.tier = "crew_member";
		kitchen.limits = {
			maxInventoryItems: -1,
			maxMeals: -1,
			maxGroceryLists: -1,
		};
		kitchen.capacity.cargo = { current: 163, limit: -1, canAdd: -1 };
		kitchen.credits = 10;

		const actions = buildKitchenAwareSuggestedActions(
			{
				claimed: true,
				status: "claimed",
				claimUrlAvailable: false,
				preClaim: false,
			},
			{
				canRead: true,
				canWriteInventory: true,
				canWriteGalley: false,
				canWriteManifest: false,
				canWriteSupply: false,
				canWritePreferences: false,
			},
			kitchen,
		);

		expect(actions.some((a) => a.action === "seed_inventory")).toBe(false);
		expect(actions.some((a) => a.action === "search_ingredients")).toBe(true);
		expect(actions.some((a) => a.action === "get_expiring_items")).toBe(true);
	});
});
