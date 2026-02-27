import type { Route } from "./+types/home";
import "../../load-context";
import { useState } from "react";
import { Link, redirect } from "react-router";
import { AuthWidget } from "~/components/auth";
import { FeatureCarousel } from "~/components/home/FeatureCarousel";
import { LifecycleStepper } from "~/components/home/LifecycleStepper";
import {
	CheckIcon,
	CloseIcon,
	CodeIcon,
	LightningBoltIcon,
} from "~/components/icons/PageIcons";
import { createAuth } from "~/lib/auth.server";
import { CREDIT_PACKS, SUBSCRIPTION_PRODUCTS } from "~/lib/stripe.server";
import { TIER_LIMITS, WELCOME_VOUCHER } from "~/lib/tiers.server";
import { APP_VERSION } from "~/lib/version";

export async function loader({ request, context }: Route.LoaderArgs) {
	const auth = createAuth(context.cloudflare.env);
	const session = await auth.api.getSession({ headers: request.headers });

	if (session?.user) {
		throw redirect("/hub");
	}

	return {
		tierLimits: TIER_LIMITS,
		creditPacks: CREDIT_PACKS,
		subscriptionProducts: SUBSCRIPTION_PRODUCTS,
		welcomeVoucher: WELCOME_VOUCHER,
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
	const [voucherDismissed, setVoucherDismissed] = useState(false);

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
						<div className="w-full flex justify-center mt-4">
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
										MEAL_MATCH
									</span>
									<span>threshold: 0.82</span>
								</div>
							</div>
							<div className="glass-panel rounded-2xl p-6 space-y-4">
								<h3 className="text-display text-lg text-carbon">
									Supply Generation
								</h3>
								<p className="text-sm text-muted leading-relaxed">
									When building a Supply list, Ration compares meal ingredients
									against your Cargo with tight precision. Items you already
									have are excluded, so you only buy what's missing.
								</p>
								<div className="flex items-center gap-2 text-xs font-mono text-carbon/50">
									<span className="px-2 py-1 bg-carbon/5 rounded">
										SUPPLY_MATCH
									</span>
									<span>threshold: 0.84</span>
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
									<span>threshold: 0.85</span>
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
										<li>Subscribe to Crew Member (€12/year)</li>
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
						<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
									cost: "2 CR",
									img: "/static/ai-url-import.webp",
								},
								{
									id: "generate",
									title: "AI Meal Generation",
									desc: "Generate meal ideas from your current Cargo. AI builds recipes using what you already have, respecting your preferences and allergens.",
									cost: "2 CR",
									img: "/static/ai-meal-generation.webp",
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

					{/* ── PUBLIC API ── */}
					<section className="w-full max-w-5xl border-t border-carbon/10 pt-16 md:pt-24">
						<div className="glass-panel rounded-2xl p-8 md:p-10 flex flex-col md:flex-row gap-6 items-start">
							<div className="w-12 h-12 rounded-xl bg-hyper-green/10 flex items-center justify-center shrink-0">
								<CodeIcon className="w-6 h-6 text-hyper-green" />
							</div>
							<div className="space-y-3">
								<h2 className="text-display text-xl text-carbon">
									Open Integration
								</h2>
								<p className="text-sm text-muted leading-relaxed max-w-xl">
									Ration exposes a public API for developers and power users.
									Query your Cargo inventory, read meal plans, pull Supply
									lists, and integrate Ration data into your own workflows and
									automations. REST endpoints, JSON responses, token-based auth.
								</p>
								<p className="text-xs text-carbon/40 font-mono">
									API documentation coming soon — stay tuned.
								</p>
							</div>
						</div>
					</section>

					{/* ── PRICING ── */}
					<section className="w-full max-w-5xl space-y-10 border-t border-carbon/10 pt-16 md:pt-24">
						<SectionHeader
							centered
							title="Pricing"
							subtitle="Start free with full access to the lifecycle. AI features run on credits — buy packs anytime, or get yearly credits with Crew Member."
						/>

						{loaderData.welcomeVoucher && !voucherDismissed && (
							<div className="glass-panel rounded-xl p-4 border border-hyper-green/30 text-center max-w-xl mx-auto relative">
								<button
									type="button"
									onClick={() => setVoucherDismissed(true)}
									className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full text-muted hover:text-carbon hover:bg-carbon/5 transition-colors"
									aria-label="Dismiss"
								>
									<CloseIcon className="w-3.5 h-3.5" />
								</button>
								<p className="text-sm text-carbon">
									Welcome voucher: use code{" "}
									<span className="font-bold text-hyper-green">
										{loaderData.welcomeVoucher.promoCode}
									</span>{" "}
									for a free Supply Run pack.
								</p>
							</div>
						)}

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
									{loaderData.subscriptionProducts.CREW_MEMBER_ANNUAL.price} —
									unlimited capacity, groups, credit transfers, and yearly
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
											{pack.price}
										</div>
										<div className="text-xs text-muted mt-1">
											{pack.credits} credits
										</div>
										<div className="text-xs text-muted mt-1">
											{pack.description}
										</div>
										{pack.badge && (
											<span className="inline-block mt-2 text-[10px] bg-hyper-green/10 text-hyper-green px-2 py-0.5 rounded-full">
												{pack.badge}
											</span>
										)}
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
