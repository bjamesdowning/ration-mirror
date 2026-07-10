import { describe, expect, it } from "vitest";
import { buildHomeFaqEntries } from "~/lib/home-faq";

const tierLimits = {
	free: {
		maxInventoryItems: 50,
		maxMeals: 25,
		maxGroceryLists: 3,
	},
};

const subscriptionProducts = {
	CREW_MEMBER_MONTHLY: { priceUsd: "$2/mo" },
	CREW_MEMBER_ANNUAL: { priceUsd: "$12/yr" },
};

describe("buildHomeFaqEntries", () => {
	it("returns nine FAQ entries with tier-aware pricing answer", () => {
		const entries = buildHomeFaqEntries({ tierLimits, subscriptionProducts });
		expect(entries).toHaveLength(9);
		expect(entries[0]?.question).toBe("What is Ration?");
		expect(entries[3]?.answer).toContain("50 pantry items");
		expect(entries[3]?.answer).toContain("$2/mo");
	});

	it("includes MCP and export guidance in agent-related answers", () => {
		const entries = buildHomeFaqEntries({ tierLimits, subscriptionProducts });
		const assistantAnswer = entries.find(
			(entry) => entry.question === "How does Ration work with AI assistants?",
		)?.answer;
		expect(assistantAnswer).toContain("mcp.ration.mayutic.com/mcp");
		expect(assistantAnswer).toContain("auth.md");

		const exportAnswer = entries.find(
			(entry) => entry.question === "Can I export my data?",
		)?.answer;
		expect(exportAnswer).toContain("v1 REST API");
	});

	it("explains Copilot, MCP, and iOS availability", () => {
		const entries = buildHomeFaqEntries({ tierLimits, subscriptionProducts });
		expect(
			entries.find((entry) => entry.question === "What is Ration Copilot?")
				?.answer,
		).toContain("built-in AI kitchen assistant");
		expect(
			entries.find((entry) => entry.question === "Is there a Ration iOS app?")
				?.answer,
		).toContain("coming soon");
	});
});
