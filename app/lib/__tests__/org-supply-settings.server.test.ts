import { describe, expect, it } from "vitest";
import { canManageGroupSupplySettings } from "../org-supply-settings.server";

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
});
