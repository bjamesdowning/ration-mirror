import { describe, expect, it } from "vitest";
import { resolveSupplyManifestWindow } from "../manifest-dates";
import {
	applySupplySettingsPatch,
	canManageGroupSupplySettings,
} from "../org-supply-settings.server";

describe("org-supply-settings.server", () => {
	describe("canManageGroupSupplySettings", () => {
		it("allows owner and admin", () => {
			expect(canManageGroupSupplySettings("owner")).toBe(true);
			expect(canManageGroupSupplySettings("admin")).toBe(true);
		});

		it("denies member", () => {
			expect(canManageGroupSupplySettings("member")).toBe(false);
		});
	});

	describe("applySupplySettingsPatch", () => {
		it("stores a time zone only when the kitchen has none", () => {
			const first = applySupplySettingsPatch(
				{ isPersonal: true, supplySettings: { manifestHorizonDays: 7 } },
				{ timeZone: "Europe/Dublin" },
			);
			expect(first.supplySettings?.timeZone).toBe("Europe/Dublin");
			expect(first.supplySettings?.manifestHorizonDays).toBe(7);
			expect(first.isPersonal).toBe(true);

			const second = applySupplySettingsPatch(first, {
				timeZone: "America/Los_Angeles",
			});
			expect(second.supplySettings?.timeZone).toBe("Europe/Dublin");
		});

		it("keeps the stored zone when the horizon changes", () => {
			const next = applySupplySettingsPatch(
				{
					supplySettings: { timeZone: "Europe/Dublin", manifestHorizonDays: 7 },
				},
				{ manifestHorizonDays: 14 },
			);
			expect(next.supplySettings).toEqual({
				timeZone: "Europe/Dublin",
				manifestHorizonDays: 14,
			});
		});

		it("does not move an explicit supply window onto a different day", () => {
			const metadata = applySupplySettingsPatch(null, {
				timeZone: "America/Los_Angeles",
				manifestHorizonDays: 3,
			});
			const window = resolveSupplyManifestWindow(metadata, "2026-03-08");
			expect(window.startDate).toBe("2026-03-08");
			expect(window.endDate).toBe("2026-03-10");
		});
	});
});
