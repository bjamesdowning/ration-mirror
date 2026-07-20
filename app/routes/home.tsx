import type { Route } from "./+types/home";
import "../../load-context";
import { useEffect, useState } from "react";
import { Link, redirect, useLocation } from "react-router";
import { AuthWidget } from "~/components/auth";
import { CheckIcon } from "~/components/icons/PageIcons";
import { SplashExperience } from "~/components/marketing/SplashExperience";
import { CurrencyToggle } from "~/components/pricing/CurrencyToggle";
import { JsonLd } from "~/components/seo/JsonLd";
import { PublicFooter } from "~/components/shell/PublicFooter";
import { PublicHeader } from "~/components/shell/PublicHeader";
import { createAuth } from "~/lib/auth.server";
import type { DisplayCurrency } from "~/lib/currency";
import { buildHomeFaqEntries } from "~/lib/home-faq";
import { canonicalMeta, ogMeta } from "~/lib/seo";
import {
	faqSchema,
	organizationSchema,
	softwareAppSchema,
	websiteSchema,
} from "~/lib/structured-data";

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
	const { TIER_LIMITS } = await import("~/lib/tiers.server");

	return {
		tierLimits: TIER_LIMITS,
		creditPacks: CREDIT_PACKS,
		subscriptionProducts: SUBSCRIPTION_PRODUCTS,
		recentPosts: getRecentPosts(3),
	};
}

export function meta(_: Route.MetaArgs) {
	const title = "Ration — AI Pantry Management, Copilot & MCP";
	const description =
		"AI pantry management in one closed loop. Track inventory, plan meals and build shopping lists with Ration Copilot or any MCP-compatible assistant.";
	return [
		{ title },
		{ name: "description", content: description },
		canonicalMeta("/"),
		...ogMeta({ title, description, path: "/" }),
	];
}

type FeatureValue = boolean | string;

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
					subtitle="AI features use credits on both tiers. New human accounts start with 12 free credits. Crew Member unlocks household groups, unlimited capacity, and credit transfers."
				/>
			</div>
			<p className="text-center text-xs text-muted max-w-xl mx-auto">
				EUR prices include VAT where applicable. US list prices match the App
				Store; sales tax may be added at checkout.
			</p>

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
						<li>12 welcome credits for new human accounts</li>
						<li>AI credits available as one-time packs</li>
						<li>AI agent access (autonomous MCP registration + OAuth)</li>
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
						<li>Buy credit packs as needed for AI features</li>
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
							<FeatureRow
								label="MCP Server (autonomous registration + OAuth)"
								free
								crew
							/>
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
		organizationSchema({}),
		websiteSchema(),
		softwareAppSchema({
			name: "Ration",
			description:
				"AI pantry management in one closed loop: inventory, recipes, meal plans, and shopping lists controlled by the built-in Ration Copilot or Claude, ChatGPT, Cursor, and other MCP-compatible assistants.",
			offers: [
				{
					name: "Free",
					price: "0",
					priceCurrency: "EUR",
					description: `Up to ${loaderData.tierLimits.free.maxInventoryItems} pantry items, ${loaderData.tierLimits.free.maxMeals} recipes, ${loaderData.tierLimits.free.maxGroceryLists} supply lists. Includes 12 welcome credits for new human accounts.`,
				},
				{
					name: "Crew Member (Monthly)",
					price: "2",
					priceCurrency: "EUR",
					description:
						"Unlimited inventory, recipes, supply lists; group sharing; autonomous MCP registration and OAuth access.",
				},
				{
					name: "Crew Member (Annual)",
					price: "12",
					priceCurrency: "EUR",
					description:
						"Unlimited inventory, recipes, supply lists; group sharing; capacity-only subscription (no included credits).",
				},
			],
		}),
		faqSchema(
			buildHomeFaqEntries({
				tierLimits: loaderData.tierLimits,
				subscriptionProducts: loaderData.subscriptionProducts,
			}),
		),
	];

	const faqEntries = buildHomeFaqEntries({
		tierLimits: loaderData.tierLimits,
		subscriptionProducts: loaderData.subscriptionProducts,
	});

	return (
		<div className="min-h-screen bg-ceramic text-carbon flex flex-col">
			<JsonLd data={homeSchemas} />

			<PublicHeader showLiveVersion />

			<main className="splash-page flex-1">
				<SplashExperience />
				<div className="max-w-7xl mx-auto px-6 py-16 md:py-24 space-y-24 md:space-y-32">
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

					<section
						id="faq"
						aria-labelledby="faq-heading"
						className="glass-panel rounded-2xl p-6 md:p-10 space-y-6 scroll-mt-24"
					>
						<div>
							<span className="text-xs font-bold uppercase tracking-wider text-hyper-green">
								FAQ
							</span>
							<h2
								id="faq-heading"
								className="text-display text-2xl md:text-3xl text-carbon mt-2"
							>
								Common questions
							</h2>
							<p className="text-muted text-sm max-w-2xl mt-2 leading-relaxed">
								Direct answers for humans and AI agents researching Ration.
							</p>
						</div>
						<div className="space-y-3">
							{faqEntries.map((entry) => (
								<details
									key={entry.question}
									className="group rounded-xl border border-platinum bg-ceramic/80 open:border-hyper-green/30"
								>
									<summary className="cursor-pointer list-none px-4 py-4 text-sm font-semibold text-carbon marker:content-none [&::-webkit-details-marker]:hidden">
										<span className="flex items-start justify-between gap-4">
											{entry.question}
											<span
												aria-hidden
												className="text-hyper-green transition-transform group-open:rotate-45"
											>
												+
											</span>
										</span>
									</summary>
									<div className="px-4 pb-4 text-sm text-muted leading-relaxed border-t border-platinum/80 pt-3">
										{entry.answer}
									</div>
								</details>
							))}
						</div>
					</section>

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
								subtitle="Create an account for the web app, or let your MCP agent self-provision a kitchen via auth.md — then paste the MCP URL into your AI client."
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
