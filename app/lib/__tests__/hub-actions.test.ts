import { describe, expect, it } from "vitest";
import {
	HUB_ACTION_LABELS,
	hubActionPath,
	visibleHubActions,
} from "../hub-actions";

const allOn = {
	logToFuel: true,
	scanToCargo: true,
	generateMeal: true,
	planWeek: true,
	dockFromReceipt: true,
};

describe("hub action menu", () => {
	it("lists every AI feature in product order", () => {
		expect(HUB_ACTION_LABELS).toEqual([
			"Log to Fuel",
			"Scan to Cargo",
			"Generate Meal",
			"Plan Week",
			"Dock from Receipt",
		]);
		expect(visibleHubActions(allOn).map((action) => action.label)).toEqual([
			...HUB_ACTION_LABELS,
		]);
	});

	it("drops flagged-off rows without reordering the rest", () => {
		expect(
			visibleHubActions({
				logToFuel: false,
				scanToCargo: true,
				generateMeal: false,
				planWeek: true,
				dockFromReceipt: true,
			}).map((action) => action.label),
		).toEqual(["Scan to Cargo", "Plan Week", "Dock from Receipt"]);
	});

	it("sends each row to the page that already owns that flow", () => {
		expect(hubActionPath("log-to-fuel")).toBe(
			"/hub/manifest?hubAction=log-to-fuel",
		);
		expect(hubActionPath("scan-to-cargo")).toBe(
			"/hub/cargo?hubAction=scan-to-cargo",
		);
		expect(hubActionPath("generate-meal")).toBe(
			"/hub/galley?hubAction=generate-meal",
		);
		expect(hubActionPath("plan-week")).toBe(
			"/hub/manifest?hubAction=plan-week",
		);
		expect(hubActionPath("dock-from-receipt")).toBe(
			"/hub/supply?hubAction=dock-from-receipt",
		);
	});
});
