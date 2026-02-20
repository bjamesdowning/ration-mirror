import type { Route } from "./+types/home";
import "../../load-context"; // Ensure augmentation is loaded
import { useState } from "react";
import { Link, redirect } from "react-router";
import { AuthWidget } from "~/components/auth";
import { createAuth } from "~/lib/auth.server";
import { CREDIT_PACKS, SUBSCRIPTION_PRODUCTS } from "~/lib/stripe.server";
import { TIER_LIMITS, WELCOME_VOUCHER } from "~/lib/tiers.server";
import { APP_VERSION } from "~/lib/version";

export async function loader({ request, context }: Route.LoaderArgs) {
	const auth = createAuth(context.cloudflare.env);
	const session = await auth.api.getSession({ headers: request.headers });

	// If user is logged in, redirect to dashboard
	if (session?.user) {
		throw redirect("/dashboard");
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
		{ title: "Ration - Kitchen Lifecycle Platform" },
		{
			name: "description",
			content:
				"Closed-loop kitchen management: track pantry, plan meals with AI, auto-generate grocery lists, and refill inventory. Simple, self-sustaining.",
		},
	];
}

const LIFECYCLE_STAGES = [
	{
		id: "ingest",
		title: "Ingest",
		desc: "Scan receipts or pantry, import CSV, paste recipe URLs, or add items manually.",
	},
	{
		id: "pantry",
		title: "Pantry",
		desc: "Track inventory with tags, quantities, units, and expiration alerts.",
	},
	{
		id: "meals",
		title: "Meals",
		desc: "Plan what to cook. AI generates options from what you have, or import recipes by URL.",
	},
	{
		id: "lists",
		title: "Lists",
		desc: "Grocery lists auto-populate from selected meals. Share and export.",
	},
	{
		id: "shop",
		title: "Shop",
		desc: "Complete your list and dock cargo — purchased items flow back into your pantry.",
	},
] as const;

const AI_FEATURES = [
	{
		id: "scan",
		title: "Photo & Receipt Scanning",
		desc: "Snap a photo of a receipt or your pantry shelf. AI extracts items, quantities, and expiry dates automatically.",
		img: "/static/ai-scan-illustration.webp",
	},
	{
		id: "url",
		title: "Recipe Import via URL",
		desc: "Paste a recipe URL. AI reads the page and extracts ingredients, steps, and metadata into a structured meal.",
		img: "/static/ai-url-import.webp",
	},
	{
		id: "generate",
		title: "AI Meal Generation",
		desc: "Generate meal ideas from what you already have. AI builds options using your current pantry inventory and preferences.",
		img: "/static/ai-meal-generation.webp",
	},
] as const;

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
		if (value === true) return <span className="text-hyper-green">✓</span>;
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

export default function Home({ loaderData }: Route.ComponentProps) {
	const [voucherDismissed, setVoucherDismissed] = useState(false);
	return (
		<div className="min-h-screen bg-ceramic text-carbon flex flex-col relative">
			{/* Subtle gradient background */}
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
					<span className="text-hyper-green">⚡</span> Early Access {" // "}v
					{APP_VERSION}
				</p>
			</div>

			{/* Main Content */}
			<main className="flex-1 w-full relative z-20">
				<div className="max-w-7xl mx-auto px-6 py-12 md:py-24 flex flex-col items-center gap-24 md:gap-32">
					{/* Hero Section */}
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
								Your kitchen, on autopilot. A closed-loop platform that tracks
								what you have, plans what to cook, and knows what to buy next.
							</p>
							<p className="text-muted text-sm max-w-lg mx-auto">
								Built for people who want simplicity, not another app to manage.
								Free-form enough to build how you like, designed as a lifecycle.
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

					{/* Lifecycle Section */}
					<section
						id="lifecycle"
						className="w-full max-w-5xl space-y-12 border-t border-carbon/10 pt-16 md:pt-24 scroll-mt-24"
					>
						<div className="space-y-4 text-center max-w-2xl mx-auto">
							<h2 className="text-display text-2xl md:text-3xl text-carbon flex items-center justify-center gap-4">
								<span className="w-8 h-[3px] bg-hyper-green rounded-full" />
								The Closed-Loop Lifecycle
								<span className="w-8 h-[3px] bg-hyper-green rounded-full" />
							</h2>
							<p className="text-muted leading-relaxed">
								Built for people who want their kitchen to run itself. AI powers
								ingestion and meal generation. Lists automate shopping. Shopping
								refills inventory. The loop closes on its own.
							</p>
						</div>
						<div className="flex justify-center">
							<img
								src="/static/lifecycle-diagram.webp"
								alt="Ingest → Pantry → Meals → Lists → Shop → Pantry"
								className="max-w-full h-auto max-h-64 md:max-h-80"
								loading="lazy"
							/>
						</div>
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
							{LIFECYCLE_STAGES.map((stage) => (
								<div
									key={stage.id}
									className="glass-panel rounded-xl p-4 hover:border-hyper-green/30 transition-colors"
								>
									<h3 className="text-display text-sm font-semibold text-carbon mb-1">
										{stage.title}
									</h3>
									<p className="text-xs text-muted leading-relaxed">
										{stage.desc}
									</p>
								</div>
							))}
						</div>
					</section>

					{/* AI Features Section */}
					<section className="w-full max-w-5xl space-y-12 border-t border-carbon/10 pt-16 md:pt-24">
						<div className="space-y-4">
							<h2 className="text-display text-2xl text-carbon flex items-center gap-4">
								<span className="w-8 h-[3px] bg-hyper-green rounded-full" />
								AI-Powered Features
							</h2>
							<div className="text-label text-muted">
								Let AI handle the tedious parts
							</div>
						</div>
						<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
							{AI_FEATURES.map((feature) => (
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
									<h3 className="text-display text-lg text-carbon mb-2 group-hover:text-hyper-green transition-colors">
										{feature.title}
									</h3>
									<p className="text-sm text-muted leading-relaxed">
										{feature.desc}
									</p>
								</div>
							))}
						</div>
					</section>

					{/* Pricing Section */}
					<section className="w-full max-w-5xl space-y-12 border-t border-carbon/10 pt-16 md:pt-24">
						<div className="space-y-4 text-center">
							<h2 className="text-display text-2xl text-carbon flex items-center justify-center gap-4">
								<span className="w-8 h-[3px] bg-hyper-green rounded-full" />
								Pricing
								<span className="w-8 h-[3px] bg-hyper-green rounded-full" />
							</h2>
							<p className="text-muted text-sm max-w-xl mx-auto">
								Start free with full access to the lifecycle. AI features run on
								credits — buy packs anytime, or get yearly credits with Crew
								Member.
							</p>
						</div>

						{loaderData.welcomeVoucher && !voucherDismissed && (
							<div className="glass-panel rounded-xl p-4 border border-hyper-green/30 text-center max-w-xl mx-auto relative">
								<button
									type="button"
									onClick={() => setVoucherDismissed(true)}
									className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full text-muted hover:text-carbon hover:bg-carbon/5 transition-colors"
									aria-label="Dismiss"
								>
									✕
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
											Inventory
										</td>
									</tr>
									<FeatureRow
										label="Pantry items"
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
									<FeatureRow label="Search & smart filters" free crew />
									<tr className="bg-carbon/[0.02]">
										<td
											colSpan={3}
											className="px-4 py-2 text-xs uppercase tracking-wider text-muted font-semibold"
										>
											Meals
										</td>
									</tr>
									<FeatureRow
										label="Meals"
										free={`${loaderData.tierLimits.free.maxMeals}`}
										crew="Unlimited"
									/>
									<FeatureRow label="Meal planning & matching" free crew />
									<FeatureRow label="Mark meals as cooked" free crew />
									<tr className="bg-carbon/[0.02]">
										<td
											colSpan={3}
											className="px-4 py-2 text-xs uppercase tracking-wider text-muted font-semibold"
										>
											Supply Lists
										</td>
									</tr>
									<FeatureRow label="Supply List" free crew />
									<FeatureRow label="Auto-generate from meals" free crew />
									<FeatureRow label="Export (text, markdown)" free crew />
									<FeatureRow label="Dock Cargo (list → pantry)" free crew />
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
									<FeatureRow label="Recipe import via URL" free crew />
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
									<FeatureRow label="Shared inventory & credits" crew />
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
									Everything you need to run the cycle
								</p>
								<Link
									to="/dashboard/pricing"
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
									unlimited capacity, groups, and yearly credits
								</p>
								<Link
									to="/dashboard/pricing"
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
											to="/dashboard/pricing"
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

				{/* Data & Privacy Section */}
				<section className="w-full max-w-2xl mx-auto glass-panel rounded-2xl p-8 mt-24 text-center">
					<h2 className="text-display text-xl text-carbon mb-4">
						Data & Privacy
					</h2>
					<div className="text-label text-muted mb-6">Transparency First</div>
					<p className="text-sm text-muted leading-relaxed max-w-lg mx-auto">
						Ration uses Google OAuth for secure authentication. We access only
						your basic profile (ID, email, name) to secure your account. Your
						inventory and meal data stay yours. We{" "}
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
