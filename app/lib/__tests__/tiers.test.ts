import { describe, expect, it } from "vitest";
import {
	CREW_MEMBER_PRODUCT,
	isTierSlug,
	TIER_LIMITS,
	TIER_ORDINAL,
} from "~/lib/tiers.server";

describe("isTierSlug", () => {
	it("returns true for 'free'", () => {
		expect(isTierSlug("free")).toBe(true);
	});

	it("returns true for 'crew_member'", () => {
		expect(isTierSlug("crew_member")).toBe(true);
	});

	it("returns false for unknown strings", () => {
		expect(isTierSlug("admin")).toBe(false);
		expect(isTierSlug("premium")).toBe(false);
		expect(isTierSlug("")).toBe(false);
		expect(isTierSlug("FREE")).toBe(false);
	});
});

describe("TIER_LIMITS", () => {
	it("free tier has finite inventory cap (moderate: 35)", () => {
		expect(TIER_LIMITS.free.maxInventoryItems).toBe(35);
	});

	it("free tier has finite meal cap (moderate: 15)", () => {
		expect(TIER_LIMITS.free.maxMeals).toBe(15);
	});

	it("free tier has finite grocery list cap (3)", () => {
		expect(TIER_LIMITS.free.maxGroceryLists).toBe(3);
	});

	it("crew_member tier has unlimited inventory (-1)", () => {
		expect(TIER_LIMITS.crew_member.maxInventoryItems).toBe(-1);
	});

	it("free tier cannot invite members", () => {
		expect(TIER_LIMITS.free.canInviteMembers).toBe(false);
	});

	it("crew_member tier can invite members", () => {
		expect(TIER_LIMITS.crew_member.canInviteMembers).toBe(true);
	});

	it("free tier cannot share grocery lists", () => {
		expect(TIER_LIMITS.free.canShareGroceryLists).toBe(false);
	});

	it("crew_member tier can share grocery lists", () => {
		expect(TIER_LIMITS.crew_member.canShareGroceryLists).toBe(true);
	});
});

describe("TIER_ORDINAL", () => {
	it("crew_member has higher ordinal than free", () => {
		expect(TIER_ORDINAL.crew_member).toBeGreaterThan(TIER_ORDINAL.free);
	});

	it("free ordinal is 0", () => {
		expect(TIER_ORDINAL.free).toBe(0);
	});
});

describe("CREW_MEMBER_PRODUCT", () => {
	it("has correct slug", () => {
		expect(CREW_MEMBER_PRODUCT.slug).toBe("crew_member");
	});

	it("has non-zero credits on signup", () => {
		expect(CREW_MEMBER_PRODUCT.creditsOnSignup).toBeGreaterThan(0);
	});

	it("has non-zero credits on renewal", () => {
		expect(CREW_MEMBER_PRODUCT.creditsOnRenewal).toBeGreaterThan(0);
	});
});
