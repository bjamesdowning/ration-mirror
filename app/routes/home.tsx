import type { Route } from "./+types/home";
import "../../load-context";
import { useEffect, useState } from "react";
import { Link, redirect, useLocation } from "react-router";
import { AuthWidget } from "~/components/auth";
import { CheckIcon, CodeIcon } from "~/components/icons/PageIcons";
import { CurrencyToggle } from "~/components/pricing/CurrencyToggle";
import { JsonLd } from "~/components/seo/JsonLd";
import { PublicFooter } from "~/components/shell/PublicFooter";
import { PublicHeader } from "~/components/shell/PublicHeader";
import { createAuth } from "~/lib/auth.server";
import type { DisplayCurrency } from "~/lib/currency";
import { canonicalMeta, ogMeta, SITE_ORIGIN } from "~/lib/seo";
import {
	faqSchema,
	organizationSchema,
	softwareAppSchema,
	websiteSchema,
} from "~/lib/structured-data";
import { TIER_LIMITS } from "~/lib/tiers.server";

export async function loader({ request, context }: Route.LoaderArgs) {
	const auth = createAuth(context.cloudflare.env);
	const session = await auth.api.getSession({ headers: request.headers });

	if (session?.user) {
		throw redirect("/hub");
	}

	const { CREDIT_PACKS, SUBSCRIPTION_PRODUCTS } = await import(
		"~/lib/stripe.server"
	);
	const { getRecentPosts } = await import("~/lib/blog.server");

	return {
		tierLimits: TIER_LIMITS,
		creditPacks: CREDIT_PACKS,
		subscriptionProducts: SUBSCRIPTION_PRODUCTS,
		recentPosts: getRecentPosts(3),
	};
}

export function meta(_: Route.MetaArgs) {
	const title = "Ration — AI-Native Kitchen Management";
	const description =
		"Manage your entire kitchen through an AI agent. Ration connects Cargo, Galley, Manifest, Supply, credits, and MCP into one elegant meal-planning system.";
	return [
		{ title },
		{ name: "description", content: description },
		canonicalMeta("/"),
		...ogMeta({ title, description, path: "/" }),
	];
}

type FeatureValue = boolean | string;

const promptCards = [
	{
		prompt: "What can I cook tonight with what's already in Cargo?",
		tool: "match_meals",
		result: "6 cookable meals found. Two use ingredients expiring this week.",
	},
	{
		prompt: "Plan dinners through Friday and add anything missing.",
		tool: "get_meal_plan + sync_supply_from_selected_meals",
		result: "Manifest drafted. Supply list updated with 11 missing items.",
	},
	{
		prompt: "We cooked lentil soup for four.",
		tool: "consume_meal",
		result: "Ingredients deducted from Cargo using semantic matching.",
	},
];

const lifecycle = [
	{
		title: "Cargo",
		label: "Know the kitchen",
		copy: "Inventory, quantities, expiry, tags, and semantic search give your agent a live model of what is in stock.",
		image: "/static/ration-cargo-light.webp",
	},
	{
		title: "Galley",
		label: "Understand the options",
		copy: "Recipes and provisions become structured choices. Match Mode shows what can be cooked now and what is missing.",
		image: "/static/ration-galley-light.webp",
	},
	{
		title: "Manifest",
		label: "Plan the week",
		copy: "Schedule breakfast, lunch, dinner, and snacks by intent. Your agent can read the plan and adjust it around real life.",
		image: "/static/ration-manifest-dark.webp",
	},
	{
		title: "Supply",
		label: "Buy only the delta",
		copy: "Supply lists are generated from planned meals and current Cargo, then docked back into inventory after shopping.",
		image: "/static/ration-supply-shared-dark.webp",
	},
];

const experienceChapters = [
	{
		kicker: "01 / Observe",
		title: "Ration turns your kitchen into context.",
		copy: "Scan a shelf, import a receipt, or add items manually. Cargo becomes structured, searchable memory for both the app and your AI client.",
		image: "/static/ration-scan-result-dark.webp",
	},
	{
		kicker: "02 / Ask",
		title: "Your agent can reason over meals, stock, and preferences.",
		copy: "Ask what to cook, what expires soon, what to buy, or whether a recipe is possible. Ration answers from live inventory and Galley data.",
		image: "/static/mcp-server-chat.webp",
	},
	{
		kicker: "03 / Act",
		title: "Planning, shopping, and cooking close the loop.",
		copy: "The Manifest feeds Supply. Consumed meals deduct ingredients. Docked groceries refill Cargo. The system keeps moving without spreadsheet upkeep.",
		image: "/static/ration-manifest-dark.webp",
	},
];

const capabilities = [
	{
		title: "MCP control",
		copy: "AI clients can search inventory, list meals, match recipes, consume meals, manage Supply, and read the Manifest.",
		chip: "16+ tools",
		accent: true,
	},
	{
		title: "Semantic kitchen memory",
		copy: "Vector matching understands that canned tomatoes, tinned tomatoes, and cherry tomatoes are related without brittle keyword rules.",
		chip: "768 dimensions",
	},
	{
		title: "AI-assisted intake",
		copy: "Photo scanning, receipt extraction, recipe import, meal generation, and weekly planning use credits on both tiers.",
		chip: "Credits",
	},
	{
		title: "Crew households",
		copy: "Shared groups let families or housemates use the same Cargo, Galley, Manifest, Supply lists, and credit pool.",
		chip: "Groups",
	},
	{
		title: "Agent-ready discovery",
		copy: "Ration publishes Link headers, markdown negotiation, API catalog, API-key metadata, MCP server card, and agent skills.",
		chip: "Well-known",
		accent: true,
	},
	{
		title: "REST and export paths",
		copy: "Programmatic endpoints support inventory, Galley, and Supply import/export workflows with scoped API keys.",
		chip: "API v1",
	},
];

const aiFeatures = [
	"Photo and receipt scanning",
	"Meal import via URL",
	"AI meal generation from Cargo",
	"AI weekly Manifest planning",
	"Semantic ingredient search",
];

function SectionHeader({
	eyebrow,
	title,
	subtitle,
	centered = false,
}: {
	eyebrow?: string;
	title: string;
	subtitle?: string;
	centered?: boolean;
}) {
	return (
		<div
			className={`space-y-3 ${centered ? "text-center mx-auto max-w-2xl" : ""}`}
		>
			{eyebrow && (
				<p className="text-label text-hyper-green tracking-wider">{eyebrow}</p>
			)}
			<h2 className="text-display text-3xl md:text-5xl text-carbon leading-tight">
				{title}
			</h2>
			{subtitle && (
				<p className="text-muted leading-relaxed max-w-2xl">{subtitle}</p>
			)}
		</div>
	);
}

function FeatureRow({
	label,
	free = false,
	crew = false,
}: {
	label: string;
	free?: FeatureValue;
	crew?: FeatureValue;
}) {
	const renderCell = (value: FeatureValue) => {
		if (value === true)
			return <CheckIcon className="w-4 h-4 text-hyper-green mx-auto" />;
		if (value === false) return <span className="text-carbon/20">—</span>;
		return <span className="text-carbon">{value}</span>;
	};
	return (
		<tr>
			<td className="px-4 py-2.5 text-carbon">{label}</td>
			<td className="px-4 py-2.5 text-center">{renderCell(free)}</td>
			<td className="px-4 py-2.5 text-center">{renderCell(crew)}</td>
		</tr>
	);
}

function AgentCommandDeck() {
	return (
		<div className="relative">
			<div className="absolute -inset-6 rounded-[2rem] bg-hyper-green/10 blur-3xl" />
			<div className="relative glass-panel rounded-[2rem] overflow-hidden border border-hyper-green/20 shadow-2xl">
				<div className="flex items-center justify-between border-b border-carbon/10 px-5 py-3">
					<div className="flex items-center gap-2">
						<span className="h-2.5 w-2.5 rounded-full bg-hyper-green shadow-glow-sm" />
						<span className="text-xs font-bold uppercase tracking-wider text-carbon">
							Agent Kitchen Session
						</span>
					</div>
					<span className="text-[10px] font-bold uppercase tracking-wider text-muted">
						MCP / Live Context
					</span>
				</div>
				<div className="grid lg:grid-cols-5">
					<div className="lg:col-span-3 bg-carbon text-ceramic p-5 md:p-7 space-y-4">
						{promptCards.map((card) => (
							<div key={card.prompt} className="space-y-2">
								<p className="text-xs text-hyper-green">user</p>
								<p className="text-sm leading-relaxed">{card.prompt}</p>
								<div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
									<p className="text-[10px] uppercase tracking-wider text-hyper-green">
										{card.tool}
									</p>
									<p className="mt-1 text-xs text-ceramic/75">{card.result}</p>
								</div>
							</div>
						))}
					</div>
					<div className="lg:col-span-2 bg-ceramic p-5 md:p-7 flex flex-col justify-between gap-6">
						<div className="space-y-3">
							<p className="text-label text-hyper-green">Direct Control</p>
							<h3 className="text-display text-2xl text-carbon">
								Your pantry, inside your AI.
							</h3>
							<p className="text-sm text-muted leading-relaxed">
								Ration gives agents authorized read/write tools for inventory,
								meals, meal plans, shopping lists, and credits.
							</p>
						</div>
						<div className="flex flex-wrap gap-2">
							{[
								"search_ingredients",
								"match_meals",
								"consume_meal",
								"sync_supply",
							].map((tool) => (
								<span
									key={tool}
									className="rounded-full bg-carbon/5 px-3 py-1 text-[11px] text-carbon"
								>
									{tool}
								</span>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function LifecycleStory() {
	return (
		<section className="w-full space-y-8">
			<SectionHeader
				centered
				eyebrow="Closed Loop"
				title="One kitchen lifecycle, available to humans and agents."
				subtitle="The web UI is a control room. MCP is the conversational interface. Both move through the same Cargo, Galley, Manifest, Supply, and Dock loop."
			/>
			<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
				{lifecycle.map((stage, index) => (
					<div
						key={stage.title}
						className="glass-panel rounded-2xl overflow-hidden"
					>
						<div className="aspect-[4/3] bg-platinum/40 overflow-hidden">
							<img
								src={stage.image}
								alt={`${stage.title} screenshot`}
								className="h-full w-full object-cover object-top"
								loading="lazy"
							/>
						</div>
						<div className="p-5 space-y-3">
							<div className="flex items-center justify-between">
								<p className="text-[10px] font-bold uppercase tracking-wider text-hyper-green">
									0{index + 1}
								</p>
								<p className="text-[10px] uppercase tracking-wider text-muted">
									{stage.label}
								</p>
							</div>
							<h3 className="text-display text-xl text-carbon">
								{stage.title}
							</h3>
							<p className="text-sm text-muted leading-relaxed">{stage.copy}</p>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

function ExperienceChapters() {
	return (
		<section className="w-full space-y-10">
			<SectionHeader
				eyebrow="Experience"
				title="From stocked shelves to dinner decisions."
				subtitle="Ration tells a simpler story than a dashboard tour: observe the kitchen, ask the agent, then let the plan update inventory and shopping."
			/>
			<div className="space-y-6">
				{experienceChapters.map((chapter, index) => (
					<div
						key={chapter.title}
						className={`grid grid-cols-1 lg:grid-cols-2 gap-6 items-center ${
							index % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
						}`}
					>
						<div className="glass-panel rounded-2xl p-6 md:p-8 space-y-4">
							<p className="text-label text-hyper-green">{chapter.kicker}</p>
							<h3 className="text-display text-2xl md:text-4xl text-carbon leading-tight">
								{chapter.title}
							</h3>
							<p className="text-muted leading-relaxed">{chapter.copy}</p>
						</div>
						<div className="glass-panel rounded-2xl overflow-hidden">
							<img
								src={chapter.image}
								alt=""
								className="w-full aspect-video object-cover object-top"
								loading="lazy"
							/>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

function CapabilityMatrix() {
	return (
		<section className="w-full space-y-8">
			<SectionHeader
				centered
				eyebrow="Platform"
				title="Built for agents, still elegant for people."
				subtitle="The core features remain visible, but they are grouped by what a user or agent is trying to accomplish."
			/>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{capabilities.map((capability) => (
					<div
						key={capability.title}
						className={`glass-panel rounded-2xl p-6 space-y-4 ${
							capability.accent ? "border-hyper-green/30" : ""
						}`}
					>
						<div className="flex items-start justify-between gap-4">
							<h3 className="text-display text-xl text-carbon">
								{capability.title}
							</h3>
							<span className="rounded-full bg-hyper-green/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-hyper-green">
								{capability.chip}
							</span>
						</div>
						<p className="text-sm text-muted leading-relaxed">
							{capability.copy}
						</p>
					</div>
				))}
			</div>
			<div className="glass-panel rounded-2xl p-6 md:p-8 grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
				<div className="space-y-4">
					<div className="w-10 h-10 rounded-xl bg-hyper-green/10 flex items-center justify-center">
						<CodeIcon className="w-5 h-5 text-hyper-green" />
					</div>
					<h3 className="text-display text-2xl text-carbon">
						Agent-ready by design.
					</h3>
					<p className="text-sm text-muted leading-relaxed">
						Agents can discover Ration through Link headers, request markdown
						content, read an API catalog, inspect API-key protected-resource
						metadata, fetch the MCP server card, and load skill instructions.
					</p>
				</div>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
					{[
						"/.well-known/api-catalog",
						"/.well-known/mcp/server-card.json",
						"/.well-known/agent-skills/index.json",
						"Accept: text/markdown",
					].map((item) => (
						<div
							key={item}
							className="rounded-xl bg-carbon/5 p-3 font-mono text-carbon/70"
						>
							{item}
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

function PricingSection({
	loaderData,
	currency,
	setCurrency,
}: {
	loaderData: Route.ComponentProps["loaderData"];
	currency: DisplayCurrency;
	setCurrency: (currency: DisplayCurrency) => void;
}) {
	const priceKey = currency === "USD" ? "priceUsd" : "priceEur";
	return (
		<section id="pricing" className="w-full space-y-8 scroll-mt-24">
			<div className="flex flex-col items-center gap-4">
				<div className="flex items-center gap-2 text-sm text-muted">
					<span>Show prices in</span>
					<CurrencyToggle value={currency} onChange={setCurrency} />
				</div>
				<SectionHeader
					centered
					eyebrow="Pricing"
					title="Start free. Add Crew when the kitchen becomes shared."
					subtitle="AI features use credits on both tiers. Crew Member unlocks household groups, unlimited capacity, credit transfers, and included annual credits."
				/>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
				<div className="glass-panel rounded-2xl p-6 md:p-8 space-y-5">
					<div>
						<h3 className="text-display text-3xl text-carbon">Free</h3>
						<p className="text-sm text-muted mt-2">
							The full lifecycle for a personal kitchen.
						</p>
					</div>
					<ul className="space-y-3 text-sm text-muted">
						<li>{loaderData.tierLimits.free.maxInventoryItems} Cargo items</li>
						<li>{loaderData.tierLimits.free.maxMeals} meals in Galley</li>
						<li>{loaderData.tierLimits.free.maxGroceryLists} Supply lists</li>
						<li>AI credits available as one-time packs</li>
						<li>MCP and REST access with scoped API keys</li>
					</ul>
					<a
						href="#signup"
						className="inline-flex w-full justify-center rounded-xl btn-secondary px-4 py-3 text-sm font-bold"
					>
						Get started free
					</a>
				</div>

				<div className="glass-panel rounded-2xl p-6 md:p-8 space-y-5 border-hyper-green/40">
					<div>
						<h3 className="text-display text-3xl text-carbon">Crew Member</h3>
						<p className="text-sm text-muted mt-2">
							{loaderData.subscriptionProducts.CREW_MEMBER_ANNUAL[priceKey]} or{" "}
							{loaderData.subscriptionProducts.CREW_MEMBER_MONTHLY[priceKey]}.
							Built for households and shared kitchens.
						</p>
					</div>
					<ul className="space-y-3 text-sm text-muted">
						<li>Unlimited Cargo, Galley, and Supply capacity</li>
						<li>
							Up to {loaderData.tierLimits.crew_member.maxOwnedGroups} owned
							groups
						</li>
						<li>Member invites and shared household data</li>
						<li>Manifest and Supply sharing links</li>
						<li>
							{
								loaderData.subscriptionProducts.CREW_MEMBER_ANNUAL
									.creditsOnStart
							}{" "}
							yearly credits on annual
						</li>
					</ul>
					<a
						href="#signup"
						className="inline-flex w-full justify-center rounded-xl bg-hyper-green px-4 py-3 text-sm font-bold text-carbon shadow-glow-sm hover:opacity-90"
					>
						Start Crew Member
					</a>
				</div>
			</div>

			<div className="glass-panel rounded-2xl p-6 space-y-5">
				<div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
					<div>
						<h3 className="text-display text-2xl text-carbon">Credit Packs</h3>
						<p className="text-sm text-muted mt-1">
							Power scans, recipe import, meal generation, and weekly planning.
						</p>
					</div>
				</div>
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
					{Object.entries(loaderData.creditPacks).map(([packKey, pack]) => (
						<div key={packKey} className="rounded-xl bg-carbon/5 p-4">
							<div className="text-sm font-bold text-carbon">
								{pack.displayName}
							</div>
							<div className="mt-1 text-2xl font-bold text-carbon">
								{pack[priceKey]}
							</div>
							<div className="mt-1 text-xs text-muted">
								{pack.credits} credits · {pack.description}
							</div>
						</div>
					))}
				</div>
			</div>

			<details className="glass-panel rounded-2xl overflow-hidden">
				<summary className="cursor-pointer px-5 py-4 text-sm font-bold text-carbon">
					View feature comparison
				</summary>
				<div className="overflow-x-auto border-t border-carbon/10">
					<table className="w-full min-w-[34rem] text-sm">
						<thead>
							<tr className="border-b border-carbon/10">
								<th className="p-4 text-left text-muted">Feature</th>
								<th className="p-4 text-center text-carbon">Free</th>
								<th className="p-4 text-center text-hyper-green">Crew</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-carbon/5">
							<FeatureRow
								label="Manual Cargo and Supply management"
								free
								crew
							/>
							<FeatureRow label="Semantic search and Match Mode" free crew />
							<FeatureRow label="AI weekly meal planning" free crew />
							<FeatureRow label="MCP Server access" free crew />
							<FeatureRow label="REST API import/export" free crew />
							<FeatureRow label="Member invites" crew />
							<FeatureRow label="Shared Manifest/Supply links" crew />
							<FeatureRow label="Credit transfer between groups" crew />
						</tbody>
					</table>
				</div>
			</details>
		</section>
	);
}

export default function Home({ loaderData }: Route.ComponentProps) {
	const location = useLocation();
	const [currency, setCurrency] = useState<DisplayCurrency>("EUR");

	useEffect(() => {
		const stored = localStorage.getItem(
			"ration:currency",
		) as DisplayCurrency | null;
		if (stored === "USD" || stored === "EUR") setCurrency(stored);
	}, []);

	useEffect(() => {
		localStorage.setItem("ration:currency", currency);
	}, [currency]);

	const homeSchemas = [
		organizationSchema({
			founder: {
				name: "Billy Downing",
				url: `${SITE_ORIGIN}/about`,
				jobTitle: "Founder",
			},
		}),
		websiteSchema(),
		softwareAppSchema({
			name: "Ration",
			description:
				"AI-native pantry inventory, meal planning, supply lists, and MCP agent control. Manage your kitchen through Claude, ChatGPT, or any MCP-compatible assistant.",
			offers: [
				{
					name: "Free",
					price: "0",
					priceCurrency: "USD",
					description: `Up to ${TIER_LIMITS.free.maxInventoryItems} pantry items, ${TIER_LIMITS.free.maxMeals} recipes, ${TIER_LIMITS.free.maxGroceryLists} supply lists.`,
				},
				{
					name: "Crew Member",
					price: "5",
					priceCurrency: "USD",
					description:
						"Unlimited inventory, recipes, supply lists; group sharing; MCP access.",
				},
			],
		}),
		faqSchema([
			{
				question: "What is Ration?",
				answer:
					"Ration is an AI-native kitchen management system that tracks pantry inventory, plans meals, and generates supply lists. It exposes an MCP server so Claude, ChatGPT, Cursor, and other AI assistants can read and operate your kitchen directly.",
			},
			{
				question: "How does Ration work with AI assistants?",
				answer:
					"Ration ships an MCP (Model Context Protocol) server that any MCP-compatible client — Claude Desktop, Cursor, Zed, ChatGPT desktop — can connect to. The assistant can list your inventory, find cookable meals, plan a week of dinners, generate supply lists, and consume ingredients after cooking, all using natural language.",
			},
			{
				question: "Is Ration free?",
				answer:
					"Yes. The Free tier supports up to 35 pantry items, 15 recipes, and 3 supply lists with no credit card required. The Crew Member tier ($5/mo or $50/yr) removes those limits and enables group sharing, member invitations, and MCP access.",
			},
			{
				question: "What is Cargo, Galley, Manifest, and Supply?",
				answer:
					"Cargo is your live pantry inventory. Galley is your recipe library. Manifest is your weekly meal plan. Supply is your shopping list. Each surface is queryable by your AI agent through the MCP server.",
			},
			{
				question: "Does Ration work offline?",
				answer:
					"Yes — Ration is a Progressive Web App. Read access to your inventory, recipes, plan, and supply list works without a network connection. Writes sync when you reconnect.",
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
		]),
	];

	return (
		<div className="min-h-screen bg-ceramic text-carbon flex flex-col relative overflow-hidden">
			<JsonLd data={homeSchemas} />
			<div className="absolute inset-0 pointer-events-none opacity-40">
				<div className="absolute left-1/2 top-0 h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-hyper-green/10 blur-3xl" />
				<div className="absolute right-[-12rem] top-[36rem] h-[30rem] w-[30rem] rounded-full bg-carbon/5 blur-3xl" />
			</div>

			<PublicHeader showLiveVersion />

			<main className="relative z-20 flex-1">
				<div className="max-w-7xl mx-auto px-6 py-12 md:py-20 space-y-24 md:space-y-32">
					<section className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-12 items-center">
						<div className="space-y-8">
							<div className="inline-flex items-center gap-2 rounded-full border border-hyper-green/30 bg-hyper-green/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-hyper-green">
								<span className="h-1.5 w-1.5 rounded-full bg-hyper-green shadow-glow-sm" />
								MCP-first kitchen intelligence
							</div>
							<div className="space-y-5">
								<h1 className="text-display text-5xl md:text-7xl text-carbon leading-[0.95] tracking-tight">
									Manage your kitchen through your AI agent.
								</h1>
								<p className="text-lg md:text-xl text-muted leading-relaxed max-w-2xl">
									Ration connects pantry inventory, recipes, meal plans,
									shopping lists, and credits into one elegant system your AI
									can understand and operate.
								</p>
							</div>
							<div className="flex flex-col sm:flex-row gap-3">
								<a
									href="#signup"
									className="inline-flex justify-center rounded-xl bg-hyper-green px-5 py-3 text-sm font-bold text-carbon shadow-glow-sm hover:opacity-90"
								>
									Connect your kitchen
								</a>
								<a
									href="#pricing"
									className="inline-flex justify-center rounded-xl btn-secondary px-5 py-3 text-sm font-bold"
								>
									View pricing
								</a>
								<Link
									to="/docs/api"
									className="inline-flex justify-center rounded-xl border border-carbon/10 px-5 py-3 text-sm font-bold text-muted hover:text-carbon"
								>
									Agent docs
								</Link>
							</div>
							<div className="grid grid-cols-3 gap-3 max-w-xl">
								{[
									["MCP", "AI client control"],
									["Cargo", "Live pantry context"],
									["Supply", "Shopping delta"],
								].map(([label, value]) => (
									<div key={label} className="glass-panel rounded-xl p-3">
										<p className="text-label text-hyper-green">{label}</p>
										<p className="mt-1 text-xs text-muted">{value}</p>
									</div>
								))}
							</div>
						</div>
						<AgentCommandDeck />
					</section>

					<LifecycleStory />
					<ExperienceChapters />
					<CapabilityMatrix />

					<section className="w-full grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
						<div className="glass-panel rounded-2xl p-6 md:p-8 space-y-5">
							<SectionHeader
								eyebrow="AI Features"
								title="Automation where the upkeep used to be."
								subtitle="Credits power expensive AI operations while the day-to-day lifecycle stays available on both tiers."
							/>
							<div className="grid gap-3">
								{aiFeatures.map((feature) => (
									<div
										key={feature}
										className="flex items-center gap-3 rounded-xl bg-carbon/5 p-3 text-sm text-carbon"
									>
										<CheckIcon className="h-4 w-4 text-hyper-green" />
										{feature}
									</div>
								))}
							</div>
						</div>
						<div className="glass-panel rounded-2xl overflow-hidden">
							<img
								src="/static/ai-meal-generation.webp"
								alt="AI meal generation illustration"
								className="w-full aspect-[4/3] object-cover"
								loading="lazy"
							/>
							<div className="p-6">
								<p className="text-sm text-muted leading-relaxed">
									Ask for a week of dinners, a rescue meal for expiring produce,
									or a supply list for the meals already planned. Ration keeps
									the agent grounded in your actual kitchen.
								</p>
							</div>
						</div>
					</section>

					{loaderData.recentPosts.length > 0 && (
						<section aria-label="Latest from the blog" className="space-y-6">
							<div className="flex items-end justify-between flex-wrap gap-4">
								<div>
									<span className="text-xs font-bold uppercase tracking-wider text-hyper-green">
										Mission Log
									</span>
									<h2 className="text-display text-2xl md:text-3xl text-carbon mt-2">
										Latest from the blog
									</h2>
									<p className="text-muted text-sm max-w-xl mt-2 leading-relaxed">
										Guides, workflows, and field notes on running an AI-native
										kitchen.
									</p>
								</div>
								<Link
									to="/blog"
									className="text-xs font-bold uppercase tracking-widest text-hyper-green hover:translate-x-0.5 transition-transform"
								>
									All posts →
								</Link>
							</div>
							<ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
								{loaderData.recentPosts.map((post) => (
									<li key={post.slug}>
										<Link
											to={`/blog/${post.slug}`}
											className="group block glass-panel rounded-2xl p-6 hover:border-hyper-green/30 hover:shadow-glow-sm transition-all duration-200 h-full"
										>
											<div className="w-8 h-[3px] bg-hyper-green rounded-full mb-4 group-hover:w-12 transition-all duration-300" />
											<h3 className="text-display text-lg text-carbon group-hover:text-hyper-green transition-colors leading-snug mb-3">
												{post.title}
											</h3>
											<p className="text-sm text-muted leading-relaxed mb-4 line-clamp-3">
												{post.description}
											</p>
											<time
												dateTime={post.date}
												className="text-xs text-carbon/50 font-mono"
											>
												{new Date(post.date).toLocaleDateString("en-US", {
													year: "numeric",
													month: "long",
													day: "numeric",
												})}
											</time>
										</Link>
									</li>
								))}
							</ul>
						</section>
					)}

					<PricingSection
						loaderData={loaderData}
						currency={currency}
						setCurrency={setCurrency}
					/>

					<section
						id="signup"
						className="grid grid-cols-1 lg:grid-cols-[0.85fr_1fr] gap-8 items-start scroll-mt-24"
					>
						<div className="space-y-5">
							<SectionHeader
								eyebrow="Begin"
								title="Give your agent a kitchen it can actually operate."
								subtitle="Create an account, configure your group, then connect Ration from the app, API, or MCP-compatible AI client."
							/>
							<div className="glass-panel rounded-2xl p-5 space-y-3">
								<h3 className="text-display text-lg text-carbon">
									Data & Privacy
								</h3>
								<p className="text-sm text-muted leading-relaxed">
									Ration uses secure authentication and accesses only the
									profile data needed for your account. Your Cargo, Galley,
									Manifest, and Supply data stay scoped to your groups. We{" "}
									<span className="font-bold text-carbon">never sell</span> your
									personal information.
								</p>
							</div>
						</div>
						<div>
							<AuthWidget
								defaultMode="signUp"
								intentMessage={
									location.hash === "#signup"
										? "Create an account to get started and choose your plan."
										: undefined
								}
							/>
						</div>
					</section>
				</div>
			</main>

			<PublicFooter showVersion />
		</div>
	);
}
