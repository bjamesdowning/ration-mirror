import type { Route } from "./+types/home";
import "../../load-context";
import { useEffect, useState } from "react";
import { Link, redirect } from "react-router";
import { AuthWidget } from "~/components/auth";
import { FeatureCarousel } from "~/components/home/FeatureCarousel";
import { InterestSignupForm } from "~/components/home/InterestSignupForm";
import { LifecycleStepper } from "~/components/home/LifecycleStepper";
import {
	CheckIcon,
	CodeIcon,
	LightningBoltIcon,
} from "~/components/icons/PageIcons";
import { CurrencyToggle } from "~/components/pricing/CurrencyToggle";
import { createAuth } from "~/lib/auth.server";
import type { DisplayCurrency } from "~/lib/currency";
import { TIER_LIMITS } from "~/lib/tiers.server";
import { APP_VERSION } from "~/lib/version";

export async function loader({ request, context }: Route.LoaderArgs) {
	const auth = createAuth(context.cloudflare.env);
	const session = await auth.api.getSession({ headers: request.headers });

	if (session?.user) {
		throw redirect("/hub");
	}

	const { CREDIT_PACKS, SUBSCRIPTION_PRODUCTS } = await import(
		"~/lib/stripe.server"
	);

	return {
		tierLimits: TIER_LIMITS,
		creditPacks: CREDIT_PACKS,
		subscriptionProducts: SUBSCRIPTION_PRODUCTS,
	};
}

export function meta(_: Route.MetaArgs) {
	return [
		{ title: "Ration — Kitchen Lifecycle Management" },
		{
			name: "description",
			content:
				"Closed-loop kitchen management powered by vector intelligence. Track Cargo, plan meals in the Galley, schedule via Manifest, auto-generate Supply lists, and Dock it back.",
		},
	];
}

function FeatureRow({
	label,
	free = false,
	crew = false,
}: {
	label: string;
	free?: boolean | string;
	crew?: boolean | string;
}) {
	const renderCell = (value: boolean | string) => {
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
			className={`space-y-3 ${centered ? "text-center max-w-2xl mx-auto" : ""}`}
		>
			{eyebrow && (
				<span className="text-xs font-bold uppercase tracking-wider text-hyper-green">
					{eyebrow}
				</span>
			)}
			<h2
				className={`text-display text-2xl md:text-3xl text-carbon flex items-center gap-4 ${centered ? "justify-center" : ""}`}
			>
				{centered && (
					<span className="w-8 h-[3px] bg-hyper-green rounded-full" />
				)}
				{title}
				{centered && (
					<span className="w-8 h-[3px] bg-hyper-green rounded-full" />
				)}
			</h2>
			{subtitle && (
				<p className="text-muted leading-relaxed max-w-xl">{subtitle}</p>
			)}
		</div>
	);
}

export default function Home({ loaderData }: Route.ComponentProps) {
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

	return (
		<div className="min-h-screen bg-ceramic text-carbon flex flex-col relative">
			<div
				className="absolute inset-0 pointer-events-none opacity-30"
				style={{
					background:
						"radial-gradient(ellipse at top, rgba(0,224,136,0.1) 0%, transparent 50%)",
				}}
			/>

			{/* Early Access Banner */}
			<div className="relative z-50 bg-hyper-green/10 border-b border-hyper-green/20 p-2 text-center">
				<p className="text-xs uppercase tracking-wider font-bold text-carbon">
					<LightningBoltIcon className="w-3.5 h-3.5 text-hyper-green inline-block" />{" "}
					Early Access {" // "}v{APP_VERSION}
				</p>
			</div>

			<main className="flex-1 w-full relative z-20">
				<div className="max-w-7xl mx-auto px-6 py-12 md:py-24 flex flex-col items-center gap-24 md:gap-32">
					{/* ── HERO ── */}
					<div className="max-w-4xl w-full flex flex-col items-center gap-12 text-center">
						<div className="relative group">
							<div className="absolute -inset-4 bg-hyper-green/5 rounded-full blur-xl group-hover:bg-hyper-green/10 transition-all duration-500" />
							<img
								src="/static/ration-logo.svg"
								alt="Ration"
								className="w-64 md:w-96 relative z-10 drop-shadow-lg"
							/>
						</div>
						<div className="space-y-4">
							<h1 className="text-display text-4xl md:text-6xl tracking-tight text-carbon">
								Ration<span className="text-hyper-green">.app</span>
							</h1>
							<p className="text-muted text-lg md:text-xl max-w-2xl mx-auto">
								Kitchen lifecycle management. A closed-loop platform that tracks
								what you have, plans what to cook, and knows what to buy next.
							</p>
							<p className="text-muted text-sm max-w-xl mx-auto font-mono">
								Cargo → Galley → Manifest → Supply → Dock → Repeat.
							</p>
						</div>
						<div className="w-full flex flex-col items-center gap-6 mt-4">
							<InterestSignupForm />
							<AuthWidget defaultMode="signUp" />
						</div>
						<a
							href="#lifecycle"
							className="text-muted hover:text-hyper-green transition-colors animate-bounce"
							aria-label="Scroll to lifecycle"
						>
							<span className="block w-6 h-6 border-r-2 border-b-2 border-current rotate-45 -translate-y-2" />
						</a>
					</div>

					{/* ── INTERACTIVE LIFECYCLE ── */}
					<section
						id="lifecycle"
						className="w-full max-w-5xl space-y-10 border-t border-carbon/10 pt-16 md:pt-24 scroll-mt-24"
					>
						<SectionHeader
							centered
							title="The Closed-Loop Lifecycle"
							subtitle="Five stages. One loop. Your kitchen runs itself. AI powers ingestion and meal generation. Supply lists automate shopping. Shopping refills Cargo. The loop closes on its own."
						/>
						<LifecycleStepper />
					</section>

					{/* ── FEATURE CAROUSEL ── */}
					<section className="w-full max-w-5xl space-y-10 border-t border-carbon/10 pt-16 md:pt-24">
						<SectionHeader
							centered
							title="Inside the Platform"
							subtitle="Every screen built for speed and clarity. Browse the core views."
						/>
						<FeatureCarousel />
					</section>

					{/* ── VECTOR INTELLIGENCE ── */}
					<section className="w-full max-w-5xl space-y-10 border-t border-carbon/10 pt-16 md:pt-24">
						<SectionHeader
							eyebrow="Under the Hood"
							title="Semantic Intelligence"
							subtitle="Every ingredient and cargo item is mapped to a 768-dimensional vector embedding. Ration doesn't match on strings — it matches on meaning."
						/>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							<div className="glass-panel rounded-2xl p-6 space-y-4">
								<h3 className="text-display text-lg text-carbon">
									Deduplication
								</h3>
								<p className="text-sm text-muted leading-relaxed">
									Add "tinned tomatoes" and "canned tomatoes" as separate
									entries. Ration detects they're the same item at a 0.78
									similarity threshold and offers to merge. No manual cleanup.
								</p>
								<div className="flex items-center gap-2 text-xs font-mono text-carbon/50">
									<span className="px-2 py-1 bg-carbon/5 rounded">
										CARGO_MERGE
									</span>
									<span>threshold: 0.78</span>
								</div>
							</div>
							<div className="glass-panel rounded-2xl p-6 space-y-4">
								<h3 className="text-display text-lg text-carbon">
									Meal Matching
								</h3>
								<p className="text-sm text-muted leading-relaxed">
									Select a meal in the Galley and Ration maps its ingredients to
									your current Cargo using vector similarity. Match Mode
									highlights what you can cook right now — no exact‑name
									requirement.
								</p>
								<div className="flex items-center gap-2 text-xs font-mono text-carbon/50">
									<span className="px-2 py-1 bg-carbon/5 rounded">
										INGREDIENT_MATCH
									</span>
									<span>threshold: 0.78</span>
								</div>
							</div>
							<div className="glass-panel rounded-2xl p-6 space-y-4">
								<h3 className="text-display text-lg text-carbon">
									Supply Generation
								</h3>
								<p className="text-sm text-muted leading-relaxed">
									When building a Supply list, Ration compares meal ingredients
									against your Cargo using the same matching engine as the
									Galley. Items you already have are excluded, so you only buy
									what's missing.
								</p>
								<div className="flex items-center gap-2 text-xs font-mono text-carbon/50">
									<span className="px-2 py-1 bg-carbon/5 rounded">
										INGREDIENT_MATCH
									</span>
									<span>threshold: 0.78</span>
								</div>
							</div>
							<div className="glass-panel rounded-2xl p-6 space-y-4">
								<h3 className="text-display text-lg text-carbon">
									Consumption Deduction
								</h3>
								<p className="text-sm text-muted leading-relaxed">
									When you consume a meal from the Manifest, Ration deducts the
									correct Cargo items using the strictest similarity threshold.
									"chicken breast" in a recipe maps accurately to "chicken
									breast fillet" in your Cargo.
								</p>
								<div className="flex items-center gap-2 text-xs font-mono text-carbon/50">
									<span className="px-2 py-1 bg-carbon/5 rounded">
										CARGO_DEDUCTION
									</span>
									<span>threshold: 0.80</span>
								</div>
							</div>
						</div>
					</section>

					{/* ── MANIFEST & MEAL PLANNING ── */}
					<section className="w-full max-w-5xl space-y-10 border-t border-carbon/10 pt-16 md:pt-24">
						<SectionHeader
							eyebrow="Mission Control"
							title="The Manifest"
							subtitle="Your weekly meal plan. A calendar view with breakfast, lunch, dinner, and snack slots — structured for precision, flexible for real life."
						/>
						<div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
							<div className="glass-panel rounded-2xl overflow-hidden aspect-video">
								<img
									src="/static/ration-manifest-dark.webp"
									alt="Manifest weekly calendar view"
									className="w-full h-full object-cover object-top"
									loading="lazy"
								/>
							</div>
							<div className="space-y-5">
								<div className="flex items-start gap-3">
									<div className="w-8 h-8 rounded-lg bg-hyper-green/10 flex items-center justify-center shrink-0 mt-0.5">
										<span className="text-hyper-green text-sm font-bold">
											1
										</span>
									</div>
									<div>
										<h4 className="text-sm font-semibold text-carbon">
											Schedule from Galley
										</h4>
										<p className="text-xs text-muted">
											Pull meals from your Galley into specific days and meal
											slots. Plan the whole week in one session.
										</p>
									</div>
								</div>
								<div className="flex items-start gap-3">
									<div className="w-8 h-8 rounded-lg bg-hyper-green/10 flex items-center justify-center shrink-0 mt-0.5">
										<span className="text-hyper-green text-sm font-bold">
											2
										</span>
									</div>
									<div>
										<h4 className="text-sm font-semibold text-carbon">
											Consume & Deduct
										</h4>
										<p className="text-xs text-muted">
											Mark a meal as consumed. Ration deducts the ingredients
											from your Cargo automatically via vector matching.
										</p>
									</div>
								</div>
								<div className="flex items-start gap-3">
									<div className="w-8 h-8 rounded-lg bg-hyper-green/10 flex items-center justify-center shrink-0 mt-0.5">
										<span className="text-hyper-green text-sm font-bold">
											3
										</span>
									</div>
									<div>
										<h4 className="text-sm font-semibold text-carbon">
											Feed the Supply List
										</h4>
										<p className="text-xs text-muted">
											All scheduled meals auto-feed your Supply list. What's
											missing from Cargo shows up as items to buy.
										</p>
									</div>
								</div>
								<div className="flex items-start gap-3">
									<div className="w-8 h-8 rounded-lg bg-hyper-green/10 flex items-center justify-center shrink-0 mt-0.5">
										<span className="text-hyper-green text-sm font-bold">
											4
										</span>
									</div>
									<div>
										<h4 className="text-sm font-semibold text-carbon">
											Share with Crew
										</h4>
										<p className="text-xs text-muted">
											Generate a read-only shareable link for your household.
											Crew Member feature.
										</p>
									</div>
								</div>
							</div>
						</div>
					</section>

					{/* ── CREW & GROUPS ── */}
					<section className="w-full max-w-5xl space-y-10 border-t border-carbon/10 pt-16 md:pt-24">
						<SectionHeader
							eyebrow="Collaboration"
							title="Crew: Built for Households"
							subtitle="One subscription. Everyone benefits. Crew Member turns Ration into a shared platform for families, roommates, or any group that shares a kitchen."
						/>
						<div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
							<div className="space-y-6">
								<div className="glass-panel rounded-2xl p-6 space-y-3">
									<h3 className="text-display text-base text-carbon">
										Groups as Family Plans
									</h3>
									<p className="text-sm text-muted leading-relaxed">
										When you subscribe to Crew Member, you can create up to 5
										groups. Invite family members or housemates via shareable
										links. Everyone in the group inherits the owner's unlimited
										capacity — Cargo, Galley, and Supply limits are lifted for
										all members.
									</p>
								</div>
								<div className="glass-panel rounded-2xl p-6 space-y-3">
									<h3 className="text-display text-base text-carbon">
										Credit Transfer
									</h3>
									<p className="text-sm text-muted leading-relaxed">
										Credits are scoped to each group. As an owner, you can
										transfer credits between any groups you own or belong to.
										Need to move 20 credits from your personal group to the
										household group? One action in Settings.
									</p>
								</div>
								<div className="glass-panel rounded-2xl p-6 space-y-3">
									<h3 className="text-display text-base text-carbon">
										Roles & Permissions
									</h3>
									<p className="text-sm text-muted leading-relaxed">
										Owner, Admin, and Member roles. Owners manage subscriptions
										and credit transfers. Admins can invite new members. Members
										get full read/write access to shared Cargo, Galley, and
										Manifest data.
									</p>
								</div>
							</div>
							<div className="glass-panel rounded-2xl overflow-hidden">
								<picture>
									<source
										srcSet="/static/ration-group-dark.webp"
										media="(prefers-color-scheme: dark)"
									/>
									<img
										src="/static/ration-group-light.webp"
										alt="Group management with multiple members"
										className="w-full h-auto"
										loading="lazy"
									/>
								</picture>
								<div className="p-5 space-y-3 border-t border-carbon/5">
									<h4 className="text-sm font-semibold text-carbon">
										How it works
									</h4>
									<ol className="text-xs text-muted space-y-1.5 list-decimal list-inside">
										<li>
											Subscribe to Crew Member (
											{
												loaderData.subscriptionProducts.CREW_MEMBER_ANNUAL[
													currency === "USD" ? "priceUsd" : "priceEur"
												]
											}
											)
										</li>
										<li>Create a group and invite members via link</li>
										<li>Members join — capacity unlocks automatically</li>
										<li>Share Cargo, plan meals together, split shopping</li>
									</ol>
								</div>
							</div>
						</div>
					</section>

					{/* ── AI FEATURES ── */}
					<section className="w-full max-w-5xl space-y-10 border-t border-carbon/10 pt-16 md:pt-24">
						<SectionHeader
							eyebrow="Intelligence"
							title="AI-Powered Features"
							subtitle="Let AI handle the tedious parts. All AI operations run on credits — available on both tiers."
						/>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
							{[
								{
									id: "scan",
									title: "Photo & Receipt Scanning",
									desc: "Snap a photo of a receipt or your Cargo shelf. AI extracts items, quantities, and expiry dates into structured entries.",
									cost: "2 CR",
									img: "/static/ai-scan-illustration.webp",
								},
								{
									id: "url",
									title: "Meal Import via URL",
									desc: "Paste any recipe URL. AI reads the page and extracts ingredients, steps, prep time, and metadata into a structured Galley meal.",
									cost: "1 CR",
									img: "/static/ai-url-import.webp",
								},
								{
									id: "generate",
									title: "AI Meal Generation",
									desc: "Generate meal ideas from your current Cargo. AI builds recipes using what you already have, respecting your preferences and allergens.",
									cost: "2 CR",
									img: "/static/ai-meal-generation.webp",
								},
								{
									id: "weekly",
									title: "AI Weekly Planning",
									desc: "Tell Ration your week. AI reads your Cargo, cross-references your Galley, and drafts a 7-day Manifest — balanced meals, zero redundancy, allergen-aware.",
									cost: "3 CR",
									img: "/static/ai-weekly-planning.webp",
								},
								{
									id: "vectors",
									title: "Semantic Ingredient Search",
									desc: "Every item you add is converted into a vector embedding. AI understands semantic similarity between ingredients — preventing duplicates and powering smart meal matching.",
									cost: "Automatic",
									img: "/static/ai-vector-search.webp",
								},
							].map((feature) => (
								<div
									key={feature.id}
									className="group glass-panel rounded-2xl p-6 hover:shadow-lg transition-all overflow-hidden"
								>
									<div className="aspect-video rounded-lg overflow-hidden bg-platinum/50 mb-4">
										<img
											src={feature.img}
											alt=""
											className="w-full h-full object-cover object-center"
											loading="lazy"
										/>
									</div>
									<div className="flex items-center gap-2 mb-2">
										<h3 className="text-display text-lg text-carbon group-hover:text-hyper-green transition-colors">
											{feature.title}
										</h3>
										<span className="text-[10px] font-bold bg-carbon/5 text-carbon/60 px-2 py-0.5 rounded-full">
											{feature.cost}
										</span>
									</div>
									<p className="text-sm text-muted leading-relaxed">
										{feature.desc}
									</p>
								</div>
							))}
						</div>
					</section>

					{/* ── OPEN PLATFORM ── */}
					<section className="w-full max-w-5xl border-t border-carbon/10 pt-16 md:pt-24 space-y-8">
						<SectionHeader
							eyebrow="OPEN PLATFORM"
							title="Built to Connect"
							subtitle="Ration speaks REST and MCP — plug your data into any workflow, automation, or AI agent."
						/>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							{/* REST API panel */}
							<div className="glass-panel rounded-2xl p-8 flex flex-col gap-4">
								<div className="w-10 h-10 rounded-xl bg-carbon/5 flex items-center justify-center shrink-0">
									<CodeIcon className="w-5 h-5 text-carbon/60" />
								</div>
								<div className="space-y-2">
									<h3 className="text-display text-lg text-carbon">REST API</h3>
									<p className="text-sm text-muted leading-relaxed">
										Query Cargo inventory, read meal plans, and pull Supply
										lists programmatically. REST endpoints, JSON responses,
										token-based auth. Build automations, sync with external
										tools, or export your data on demand.
									</p>
									<ul className="text-xs text-muted space-y-1 pt-1">
										<li className="flex items-center gap-2">
											<span className="w-1 h-1 rounded-full bg-carbon/30 shrink-0" />
											Inventory export &amp; import
										</li>
										<li className="flex items-center gap-2">
											<span className="w-1 h-1 rounded-full bg-carbon/30 shrink-0" />
											Galley (meals) export &amp; import
										</li>
										<li className="flex items-center gap-2">
											<span className="w-1 h-1 rounded-full bg-carbon/30 shrink-0" />
											Supply list export
										</li>
									</ul>
								</div>
								<Link
									to="/hub/settings#api"
									className="mt-auto text-xs font-semibold text-carbon/50 hover:text-carbon transition-colors"
								>
									View API reference →
								</Link>
							</div>

							{/* MCP Server panel */}
							<div className="glass-panel rounded-2xl p-8 flex flex-col gap-5 border border-hyper-green/20">
								<div className="flex items-center gap-3">
									<div className="w-10 h-10 rounded-xl bg-hyper-green/10 flex items-center justify-center shrink-0">
										<svg
											className="w-5 h-5 text-hyper-green"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
											aria-hidden
										>
											<title>MCP</title>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={1.5}
												d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"
											/>
										</svg>
									</div>
									<span className="text-[10px] font-bold tracking-wider text-hyper-green bg-hyper-green/10 border border-hyper-green/30 px-2 py-1 rounded-full font-mono">
										MODEL CONTEXT PROTOCOL
									</span>
								</div>

								<div className="space-y-3">
									<h3 className="text-display text-lg text-carbon">
										Your pantry, inside your AI
									</h3>
									<p className="text-sm text-muted leading-relaxed">
										Connect Claude, Cursor, or any MCP-compatible assistant to
										your live Ration data. Your AI can query what's in stock,
										check your meal plan, and read your shopping list — no
										copy-paste, no manual updates. Just ask.
									</p>
									<ul className="text-xs text-muted space-y-1.5 pt-1">
										<li className="flex items-start gap-2">
											<span className="w-1 h-1 rounded-full bg-hyper-green/60 shrink-0 mt-1.5" />
											"What meals can I make with what's in my pantry tonight?"
										</li>
										<li className="flex items-start gap-2">
											<span className="w-1 h-1 rounded-full bg-hyper-green/60 shrink-0 mt-1.5" />
											"Generate a grocery list based on my meal plan this week"
										</li>
										<li className="flex items-start gap-2">
											<span className="w-1 h-1 rounded-full bg-hyper-green/60 shrink-0 mt-1.5" />
											"Do I have everything for this recipe?"
										</li>
									</ul>
								</div>

								{/* Screenshot */}
								<div className="rounded-xl overflow-hidden border border-carbon/10 bg-platinum/30">
									<img
										src="/static/mcp-server-chat.webp"
										alt="MCP server in action — AI assistant querying Ration inventory"
										className="w-full h-auto"
										loading="lazy"
									/>
								</div>

								<Link
									to="/hub/settings#developer"
									className="mt-auto inline-flex items-center gap-1.5 text-xs font-semibold text-hyper-green hover:text-hyper-green/80 transition-colors"
								>
									Connect your AI client
									<svg
										className="w-3.5 h-3.5"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
										aria-hidden
									>
										<title>Arrow</title>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M13 7l5 5m0 0l-5 5m5-5H6"
										/>
									</svg>
								</Link>
							</div>
						</div>
					</section>

					{/* ── PRICING ── */}
					<section className="w-full max-w-5xl space-y-10 border-t border-carbon/10 pt-16 md:pt-24">
						<div className="flex flex-col items-center gap-4">
							<div className="flex items-center gap-2 text-sm text-muted">
								<span>Show prices in</span>
								<CurrencyToggle value={currency} onChange={setCurrency} />
							</div>
							<SectionHeader
								centered
								title="Pricing"
								subtitle="Start free with full access to the lifecycle. AI features run on credits — buy packs anytime, or get yearly credits with Crew Member."
							/>
						</div>

						{/* Feature comparison table */}
						<div className="glass-panel rounded-2xl overflow-hidden">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b border-carbon/10">
										<th className="text-left p-4 text-muted font-normal">
											Feature
										</th>
										<th className="p-4 text-center text-carbon font-semibold w-28">
											Free
										</th>
										<th className="p-4 text-center text-hyper-green font-semibold w-28">
											Crew
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-carbon/5">
									<tr className="bg-carbon/[0.02]">
										<td
											colSpan={3}
											className="px-4 py-2 text-xs uppercase tracking-wider text-muted font-semibold"
										>
											Cargo
										</td>
									</tr>
									<FeatureRow
										label="Cargo items"
										free={`${loaderData.tierLimits.free.maxInventoryItems}`}
										crew="Unlimited"
									/>
									<FeatureRow label="Manual item entry" free crew />
									<FeatureRow label="CSV/TSV bulk import" free crew />
									<FeatureRow
										label="Expiry alerts & domain filters"
										free
										crew
									/>
									<FeatureRow
										label="Semantic search & smart filters"
										free
										crew
									/>
									<tr className="bg-carbon/[0.02]">
										<td
											colSpan={3}
											className="px-4 py-2 text-xs uppercase tracking-wider text-muted font-semibold"
										>
											Galley
										</td>
									</tr>
									<FeatureRow
										label="Meals & provisions"
										free={`${loaderData.tierLimits.free.maxMeals}`}
										crew="Unlimited"
									/>
									<FeatureRow label="Match Mode (vector matching)" free crew />
									<FeatureRow label="Promote Cargo to provisions" free crew />
									<tr className="bg-carbon/[0.02]">
										<td
											colSpan={3}
											className="px-4 py-2 text-xs uppercase tracking-wider text-muted font-semibold"
										>
											Manifest
										</td>
									</tr>
									<FeatureRow label="Weekly meal calendar" free crew />
									<FeatureRow label="Consume & auto-deduct" free crew />
									<FeatureRow label="Share manifest via link" crew />
									<tr className="bg-carbon/[0.02]">
										<td
											colSpan={3}
											className="px-4 py-2 text-xs uppercase tracking-wider text-muted font-semibold"
										>
											Supply
										</td>
									</tr>
									<FeatureRow
										label="Auto-generate from Galley & Manifest"
										free
										crew
									/>
									<FeatureRow label="Dock Cargo (list → inventory)" free crew />
									<FeatureRow label="Export (text, markdown, CSV)" free crew />
									<FeatureRow label="Share via public link" crew />
									<tr className="bg-carbon/[0.02]">
										<td
											colSpan={3}
											className="px-4 py-2 text-xs uppercase tracking-wider text-muted font-semibold"
										>
											AI (via credits)
										</td>
									</tr>
									<FeatureRow label="Photo & receipt scanning" free crew />
									<FeatureRow label="Meal import via URL" free crew />
									<FeatureRow label="AI meal generation" free crew />
									<FeatureRow label="AI weekly meal planning" free crew />
									<tr className="bg-carbon/[0.02]">
										<td
											colSpan={3}
											className="px-4 py-2 text-xs uppercase tracking-wider text-muted font-semibold"
										>
											Collaboration
										</td>
									</tr>
									<FeatureRow
										label="Groups"
										free={`${loaderData.tierLimits.free.maxOwnedGroups}`}
										crew={`${loaderData.tierLimits.crew_member.maxOwnedGroups}`}
									/>
									<FeatureRow label="Member invites" crew />
									<FeatureRow label="Shared Cargo & Galley" crew />
									<FeatureRow label="Credit transfer between groups" crew />
									<tr className="bg-carbon/[0.02]">
										<td
											colSpan={3}
											className="px-4 py-2 text-xs uppercase tracking-wider text-muted font-semibold"
										>
											Credits
										</td>
									</tr>
									<FeatureRow label="Purchase credit packs" free crew />
									<FeatureRow
										label="Yearly credits included"
										free={false}
										crew={`${loaderData.subscriptionProducts.CREW_MEMBER_ANNUAL.creditsOnStart}`}
									/>
									<tr className="bg-carbon/[0.02]">
										<td
											colSpan={3}
											className="px-4 py-2 text-xs uppercase tracking-wider text-muted font-semibold"
										>
											Integrations
										</td>
									</tr>
									<FeatureRow
										label="REST API (inventory, galley, supply)"
										free
										crew
									/>
									<FeatureRow label="MCP Server (AI agent access)" free crew />
								</tbody>
							</table>
						</div>

						{/* Tier CTAs */}
						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							<div className="glass-panel rounded-2xl p-6 text-center">
								<h3 className="text-display text-xl text-carbon mb-1">Free</h3>
								<p className="text-sm text-muted mb-5">
									Everything you need to run the lifecycle
								</p>
								<Link
									to="/hub/pricing"
									className="inline-block w-full py-2.5 px-4 bg-platinum text-carbon rounded-lg text-sm font-medium hover:bg-platinum/80 transition-colors"
								>
									Get started free
								</Link>
							</div>
							<div className="glass-panel rounded-2xl p-6 text-center border border-hyper-green/40">
								<h3 className="text-display text-xl text-carbon mb-1">
									Crew Member
								</h3>
								<p className="text-sm text-muted mb-5">
									{
										loaderData.subscriptionProducts.CREW_MEMBER_ANNUAL[
											currency === "USD" ? "priceUsd" : "priceEur"
										]
									}{" "}
									or{" "}
									{
										loaderData.subscriptionProducts.CREW_MEMBER_MONTHLY[
											currency === "USD" ? "priceUsd" : "priceEur"
										]
									}{" "}
									— unlimited capacity, groups, credit transfers, and yearly
									credits
								</p>
								<Link
									to="/hub/pricing"
									className="inline-block w-full py-2.5 px-4 bg-hyper-green text-carbon font-bold rounded-lg hover:opacity-90 transition-opacity"
								>
									Start Crew Member
								</Link>
							</div>
						</div>

						<div className="space-y-4">
							<h3 className="text-display text-lg text-carbon">Credit Packs</h3>
							<p className="text-sm text-muted">
								Available on both tiers. Power AI scans, meal generation, and
								recipe imports. One-time purchases.
							</p>
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
								{(
									Object.entries(loaderData.creditPacks) as Array<
										[
											keyof typeof loaderData.creditPacks,
											(typeof loaderData.creditPacks)[keyof typeof loaderData.creditPacks],
										]
									>
								).map(([packKey, pack]) => (
									<div key={packKey} className="glass-panel rounded-xl p-4">
										<div className="text-sm font-semibold text-carbon">
											{pack.displayName}
										</div>
										<div className="text-2xl font-bold text-carbon mt-1">
											{pack[currency === "USD" ? "priceUsd" : "priceEur"]}
										</div>
										<div className="text-xs text-muted mt-1">
											{pack.credits} credits
										</div>
										<div className="text-xs text-muted mt-1">
											{pack.description}
										</div>
										<Link
											to="/hub/pricing"
											className="block mt-3 w-full py-2 px-3 bg-platinum text-carbon rounded-lg text-sm font-medium text-center hover:bg-platinum/80 transition-colors"
										>
											Buy Credits
										</Link>
									</div>
								))}
							</div>
						</div>
					</section>

					{/* ── FAQ ── */}
					<section
						id="faq"
						className="w-full max-w-5xl space-y-10 border-t border-carbon/10 pt-16 md:pt-24 scroll-mt-24"
					>
						<SectionHeader
							centered
							title="Frequently Asked Questions"
							subtitle="Quick answers to common questions about Ration."
						/>
						<div className="space-y-4">
							{[
								{
									q: "If I purchase Crew Member, can I invite my roommate (or family) to a group even if they haven't purchased?",
									a: "Yes. One Crew Member subscription applies to the whole group. You create the group and send an invite link; they sign in (or sign up) and accept. They get full access to that group's Cargo, Galley, Manifest, and Supply without paying. Only the group owner needs an active Crew Member subscription for the group to have unlimited capacity and invite rights.",
								},
								{
									q: "How do credits work when several people use a group?",
									a: "Credits are stored per group. Any AI action (scan, meal import, meal generation, weekly planning) in that group uses the group's credit balance. So if you're the owner and you add credits (or have yearly credits from Crew Annual), everyone in the group benefits from that same pool when they use AI in that group.",
								},
								{
									q: "What's the difference between Crew Member Annual and Monthly?",
									a: "Features are the same: unlimited Cargo/Galley/Supply, groups, member invites, and credit transfer. The Annual plan includes 65 credits when you start and 65 on each renewal; the Monthly plan does not include credits. You can buy credit packs on either plan.",
								},
								{
									q: "What are the limits on the Free tier?",
									a: `Free includes the full lifecycle: Cargo, Galley, Manifest, Supply, and Dock. Limits: ${loaderData.tierLimits.free.maxInventoryItems} Cargo items, ${loaderData.tierLimits.free.maxMeals} meals, ${loaderData.tierLimits.free.maxGroceryLists} supply lists, and one group (your personal one). You can't invite others or share manifest/supply via link. You can buy credit packs and use all AI features within those limits.`,
								},
								{
									q: "What do Cargo, Galley, Manifest, Supply, and Dock mean?",
									a: "Cargo = your pantry inventory. Galley = your recipe/meal library. Manifest = your weekly meal plan (calendar). Supply = shopping list(s) generated from the plan and Galley. Dock = moving items from a Supply list into Cargo when you've bought them. Together they form the closed loop: Cargo → Galley → Manifest → Supply → Dock → repeat.",
								},
								{
									q: "Can I be in more than one group?",
									a: "Yes. You can own up to one group on Free and up to five on Crew Member. You can also be a member of other people's groups (e.g. your household). Each account can belong to up to 5 groups in total (owned + member). When you switch groups in the app, you see that group's Cargo, Galley, and Manifest.",
								},
								{
									q: "Who can create shareable links for the Manifest or Supply list?",
									a: "Only Crew Member groups. If the group owner has Crew Member, any admin or owner in that group can create read-only share links for the Manifest or Supply list so others (e.g. family) can view without logging in.",
								},
								{
									q: "How do I change from Monthly to Annual (or vice versa)?",
									a: "Use the billing portal from your account (e.g. Settings). There you can switch between Monthly and Annual Crew Member or cancel. You'll be charged according to the new plan at the next billing date.",
								},
								{
									q: "If I leave a group, what happens to the data?",
									a: "You lose access to that group's Cargo, Galley, Manifest, and Supply. The data stays with the group; other members keep using it. Your own personal group and any other groups you're in are unaffected.",
								},
							].map(({ q, a }) => (
								<details
									key={q}
									className="group/faq glass-panel rounded-2xl overflow-hidden border border-carbon/5 hover:border-carbon/10 transition-colors"
								>
									<summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-carbon group-open/faq:text-hyper-green">
										<span>{q}</span>
										<span className="shrink-0 text-carbon/40 transition-transform group-open/faq:rotate-180">
											<svg
												className="h-4 w-4"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
												aria-hidden
											>
												<title>Expand</title>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M19 9l-7 7-7-7"
												/>
											</svg>
										</span>
									</summary>
									<div className="border-t border-carbon/5 px-5 py-4">
										<p className="text-sm text-muted leading-relaxed">{a}</p>
									</div>
								</details>
							))}
						</div>
					</section>
				</div>

				{/* Data & Privacy */}
				<section className="w-full max-w-2xl mx-auto glass-panel rounded-2xl p-8 mt-24 text-center">
					<h2 className="text-display text-xl text-carbon mb-4">
						Data & Privacy
					</h2>
					<div className="text-label text-muted mb-6">Transparency First</div>
					<p className="text-sm text-muted leading-relaxed max-w-lg mx-auto">
						Ration uses Google OAuth for secure authentication. We access only
						your basic profile (ID, email, name) to secure your account. Your
						Cargo, Galley, and Manifest data stay yours. We{" "}
						<span className="text-carbon font-bold">never sell</span> or share
						your personal information.
					</p>
				</section>
			</main>

			{/* Footer */}
			<footer className="relative z-20 border-t border-carbon/10 bg-ceramic/90 backdrop-blur p-4 mt-12">
				<div className="flex flex-col md:flex-row justify-between items-center max-w-7xl mx-auto text-xs text-muted gap-4">
					<div className="flex gap-6">
						<span>Build v{APP_VERSION}</span>
						<Link
							to="/legal/privacy"
							className="hover:text-hyper-green transition-colors"
						>
							Privacy Policy
						</Link>
						<Link
							to="/legal/terms"
							className="hover:text-hyper-green transition-colors"
						>
							Terms of Service
						</Link>
					</div>
					<div className="hidden md:block">
						By{" "}
						<a
							href="https://www.mayutic.com"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-hyper-green transition-colors"
						>
							Mayutic
						</a>{" "}
						— Est 2025
					</div>
				</div>
			</footer>
		</div>
	);
}
