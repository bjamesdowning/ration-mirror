import type { FaqEntry } from "./structured-data";

export type HomeFaqTierLimits = {
	free: {
		maxInventoryItems: number;
		maxMeals: number;
		maxGroceryLists: number;
	};
};

export type HomeFaqSubscriptionProducts = {
	CREW_MEMBER_MONTHLY: { priceUsd: string };
	CREW_MEMBER_ANNUAL: { priceUsd: string };
};

/** Homepage FAQ entries shared by JSON-LD and visible HTML. */
export function buildHomeFaqEntries(opts: {
	tierLimits: HomeFaqTierLimits;
	subscriptionProducts: HomeFaqSubscriptionProducts;
}): FaqEntry[] {
	const { tierLimits, subscriptionProducts } = opts;
	const { free } = tierLimits;

	return [
		{
			question: "What is Ration?",
			answer:
				"Ration is an AI-native kitchen management system that tracks pantry inventory, plans meals, and generates supply lists. It exposes an MCP server so Claude, ChatGPT, Cursor, and other AI assistants can read and operate your kitchen directly — including autonomous self-registration so agents can provision a kitchen without human signup first.",
		},
		{
			question: "How does Ration work with AI assistants?",
			answer:
				"Add https://mcp.ration.mayutic.com/mcp to any MCP-compatible client (Claude Desktop, Cursor, ChatGPT desktop, Zed) — or let your agent self-register via auth.md for immediate full-write access. OAuth clients open browser sign-in to pick a household and approve scopes. Either path gives inventory, meal matching, weekly planning, supply lists, and ingredient consumption. Revoke access anytime in Hub Settings → Connected Agents.",
		},
		{
			question: "How do I connect Claude or Cursor?",
			answer:
				"Paste https://mcp.ration.mayutic.com/mcp into your MCP client settings for OAuth browser sign-in, or point autonomous agents at /auth.md to self-provision a kitchen. Select your household and authorize scopes for OAuth; claim ownership later when a human is ready. Manage grants in Hub → Settings → Connected Agents.",
		},
		{
			question: "Is Ration free?",
			answer: `Yes. The Free tier supports up to ${free.maxInventoryItems} pantry items, ${free.maxMeals} recipes, and ${free.maxGroceryLists} supply lists with no credit card required. Agents can autonomously self-register via MCP on the same tier. The Crew Member tier (${subscriptionProducts.CREW_MEMBER_MONTHLY.priceUsd} or ${subscriptionProducts.CREW_MEMBER_ANNUAL.priceUsd}) removes those limits and enables group sharing, member invitations, and full agent access.`,
		},
		{
			question: "What is Cargo, Galley, Manifest, and Supply?",
			answer:
				"Cargo is your live pantry inventory. Galley is your recipe library. Manifest is your weekly meal plan. Supply is your shopping list. Each surface is queryable by your AI agent through the MCP server.",
		},
		{
			question: "Where is my data stored?",
			answer:
				"Your data is stored in Cloudflare D1 (SQLite at the edge), Cloudflare R2 (for images), and Cloudflare Vectorize (for semantic search embeddings). All scoped to your group and only accessible by you and your invited members.",
		},
		{
			question: "Can I export my data?",
			answer:
				"Yes. Every Ration account can export full inventory, recipes, supply lists, and meal plans as JSON or CSV from the dashboard or via the v1 REST API.",
		},
	];
}
