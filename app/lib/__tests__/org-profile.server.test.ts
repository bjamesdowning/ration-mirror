import { beforeEach, describe, expect, it, vi } from "vitest";

const getMemberRole = vi.fn();

vi.mock("~/lib/org-supply-settings.server", () => ({
	getMemberRole: (...args: unknown[]) => getMemberRole(...args),
	canManageGroupSupplySettings: (role: string) =>
		role === "owner" || role === "admin",
}));

describe("patchOrganizationProfile", () => {
	beforeEach(() => {
		getMemberRole.mockReset();
	});

	it("throws 403 for members", async () => {
		getMemberRole.mockResolvedValue("member");

		const { patchOrganizationProfile } = await import(
			"~/lib/org-profile.server"
		);

		await expect(
			patchOrganizationProfile({} as D1Database, "org-1", "user-1", {
				name: "New Name",
			}),
		).rejects.toMatchObject({ status: 403 });
	});
});

describe("canManageGroupProfile", () => {
	it("allows owner and admin", async () => {
		const { canManageGroupProfile } = await import("~/lib/org-profile.server");
		expect(canManageGroupProfile("owner")).toBe(true);
		expect(canManageGroupProfile("admin")).toBe(true);
		expect(canManageGroupProfile("member")).toBe(false);
	});
});
