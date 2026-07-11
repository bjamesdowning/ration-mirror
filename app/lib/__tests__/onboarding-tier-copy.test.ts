import { describe, expect, it } from "vitest";
import { getOnboardingTierCopy } from "../onboarding-tier-copy";
import { CREW_MEMBER_PRODUCT, TIER_LIMITS } from "../tiers";

describe("getOnboardingTierCopy", () => {
	it("derives free tier limits from TIER_LIMITS", () => {
		const tiers = getOnboardingTierCopy();
		const free = tiers.find((t) => t.name === "Free");
		expect(free?.features).toContain(
			`${TIER_LIMITS.free.maxInventoryItems} cargo`,
		);
		expect(free?.features).toContain(`${TIER_LIMITS.free.maxMeals} meals`);
		expect(free?.features).toContain(
			`${TIER_LIMITS.free.maxGroceryLists} Supply lists`,
		);
	});

	it("includes crew member credits from CREW_MEMBER_PRODUCT", () => {
		const tiers = getOnboardingTierCopy();
		const crew = tiers.find((t) => t.name === CREW_MEMBER_PRODUCT.name);
		expect(crew?.highlight).toBe(true);
		expect(crew?.features).toContain(
			`${CREW_MEMBER_PRODUCT.creditsOnSignup} credits for AI scans (Annual)`,
		);
	});
});
