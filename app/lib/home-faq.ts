import type { FaqEntry } from "./structured-data";

export type HomeFaqTierLimits = {
	free: {
		maxInventoryItems: number;
		maxMeals: number;
		maxGroceryLists: number;
	};
};

export type HomeFaqSubscriptionProducts = {
	CREW_MEMBER_MONTHLY: { priceEur: string; priceUsd: string };
	CREW_MEMBER_ANNUAL: { priceEur: string; priceUsd: string };
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
				"Use Ration Copilot inside the app, or add https://mcp.ration.mayutic.com/mcp to Claude, Cursor, ChatGPT, Zed, or another MCP-compatible client. Copilot and MCP operate the same live pantry, recipes, meal plan, and shopping list. MCP access uses browser OAuth with scoped, revocable permissions; autonomous agents can also self-register through auth.md.",
		},
		{
			question: "How do I connect Claude or Cursor?",
			answer:
				"Paste https://mcp.ration.mayutic.com/mcp into your MCP client settings for OAuth browser sign-in, or point autonomous agents at /auth.md to self-provision a kitchen. Select your household and authorize scopes for OAuth; claim ownership later when a human is ready. Manage grants in Hub → Settings → Connected Agents.",
		},
		{
			question: "Is Ration free?",
			answer: `Yes. The Free tier supports up to ${free.maxInventoryItems} pantry items, ${free.maxMeals} recipes, and ${free.maxGroceryLists} supply lists with no credit card required. New human accounts receive 12 welcome credits automatically. Agents can autonomously self-register via MCP on the same tier (without welcome credits). The Crew Member tier (${subscriptionProducts.CREW_MEMBER_MONTHLY.priceEur} or ${subscriptionProducts.CREW_MEMBER_ANNUAL.priceEur}) removes capacity limits, enables group sharing and member invitations, and includes 1 free Ask Ration (Copilot) conversation per group per day.`,
		},
		{
			question: "What is Cargo, Galley, Manifest, and Supply?",
			answer:
				"Cargo is live pantry inventory. Galley is the recipe library. Manifest is the weekly meal plan. Supply is the shopping list, and Dock moves purchased items back into Cargo. Cooking deducts ingredients, so the full loop stays current for people, Copilot, and MCP-connected assistants.",
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
		{
			question: "What is Ration Copilot?",
			answer:
				"Ration Copilot (Ask Ration) is the built-in AI kitchen assistant for web and iOS. It answers questions from your live household context and can help inspect pantry stock, find meals, build plans, and keep shopping aligned. Free-tier chats use credits. Crew Member households get 1 free conversation per group per day, then further chats use the shared credit pool. MCP provides the same structured kitchen context to external AI clients.",
		},
		{
			question: "Is there a Ration iOS app?",
			answer:
				"Ration for iOS is coming soon. The native app will bring Cargo, Manifest, Supply, household sync, and Ration Copilot to iPhone. Until launch, Ration is available as a responsive web app and installable PWA.",
		},
	];
}
