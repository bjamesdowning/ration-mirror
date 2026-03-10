import {
	EmbeddedCheckout,
	EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { useEffect, useMemo, useRef, useState } from "react";
import { data, useFetcher, useNavigate } from "react-router";
import { CheckIcon, DiamondIcon } from "~/components/icons/PageIcons";
import { CurrencyToggle } from "~/components/pricing/CurrencyToggle";
import { PageHeader } from "~/components/shell/PageHeader";
import * as schema from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import type { DisplayCurrency } from "~/lib/currency";
import { shouldSyncCheckoutFromFetcher } from "~/lib/pricing-checkout";
import { TIER_LIMITS, WELCOME_VOUCHER } from "~/lib/tiers.server";
import type { Route } from "./+types/pricing";

export async function loader({ request, context }: Route.LoaderArgs) {
	const { CREDIT_PACKS, SUBSCRIPTION_PRODUCTS } = await import(
		"~/lib/stripe.server"
	);
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const db = drizzle(context.cloudflare.env.DB, { schema });

	const [userRow, inventoryCount, mealCount, listCount] = await Promise.all([
		db.query.user.findFirst({
			where: eq(schema.user.id, user.id),
			columns: {
				tier: true,
				welcomeVoucherRedeemed: true,
				tierExpiresAt: true,
				subscriptionCancelAtPeriodEnd: true,
			},
		}),
		db
			.select({ count: sql<number>`count(*)` })
			.from(schema.cargo)
			.where(eq(schema.cargo.organizationId, groupId)),
		db
			.select({ count: sql<number>`count(*)` })
			.from(schema.meal)
			.where(eq(schema.meal.organizationId, groupId)),
		db
			.select({ count: sql<number>`count(*)` })
			.from(schema.supplyList)
			.where(eq(schema.supplyList.organizationId, groupId)),
	]);

	if (!context.cloudflare.env.STRIPE_PUBLISHABLE_KEY) {
		throw data({ error: "Stripe publishable key missing" }, { status: 500 });
	}

	return {
		stripePublishableKey: context.cloudflare.env.STRIPE_PUBLISHABLE_KEY,
		userTier: userRow?.tier ?? "free",
		tierExpiresAt: userRow?.tierExpiresAt ?? null,
		subscriptionCancelAtPeriodEnd:
			userRow?.subscriptionCancelAtPeriodEnd ?? false,
		welcomeVoucherRedeemed: userRow?.welcomeVoucherRedeemed ?? false,
		welcomePromoCode: WELCOME_VOUCHER.promoCode,
		counts: {
			inventory: inventoryCount[0]?.count ?? 0,
			meals: mealCount[0]?.count ?? 0,
			groceryLists: listCount[0]?.count ?? 0,
		},
		tierLimits: TIER_LIMITS,
		creditPacks: CREDIT_PACKS,
		subscriptionProducts: SUBSCRIPTION_PRODUCTS,
	};
}

type CheckoutResponse = {
	success?: boolean;
	clientSecret?: string;
	sessionId?: string;
	error?: string;
};

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

export default function PricingPage({ loaderData }: Route.ComponentProps) {
	const checkoutFetcher = useFetcher<CheckoutResponse>();
	const navigate = useNavigate();
	const checkoutSectionRef = useRef<HTMLDivElement>(null);
	const [clientSecret, setClientSecret] = useState<string | null>(null);
	const [sessionId, setSessionId] = useState<string | null>(null);
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

	const stripePromise = useMemo(
		() => loadStripe(loaderData.stripePublishableKey),
		[loaderData.stripePublishableKey],
	);

	const fetcherData = checkoutFetcher.data;
	if (shouldSyncCheckoutFromFetcher(fetcherData, clientSecret) && fetcherData) {
		setClientSecret(fetcherData.clientSecret ?? null);
		if (fetcherData.sessionId) {
			setSessionId(fetcherData.sessionId);
		}
	}

	useEffect(() => {
		if (clientSecret) {
			checkoutSectionRef.current?.scrollIntoView({
				behavior: "smooth",
				block: "start",
			});
		}
	}, [clientSecret]);

	const handleCheckoutComplete = () => {
		if (sessionId) {
			navigate(`/hub/checkout/return?session_id=${sessionId}`);
		}
	};

	const closeCheckout = () => {
		setClientSecret(null);
		setSessionId(null);
		checkoutFetcher.reset();
	};

	const startCreditCheckout = (pack: keyof typeof loaderData.creditPacks) => {
		const formData = new FormData();
		formData.append("type", "credits");
		formData.append("pack", pack);
		formData.append("currency", currency);
		formData.append("returnUrl", "/hub/checkout/return");
		checkoutFetcher.submit(formData, {
			method: "post",
			action: "/api/checkout",
		});
	};

	const startCrewCheckout = (
		subscriptionKey: keyof typeof loaderData.subscriptionProducts,
	) => {
		const formData = new FormData();
		formData.append("type", "subscription");
		formData.append("subscription", subscriptionKey);
		formData.append("currency", currency);
		formData.append("returnUrl", "/hub/checkout/return");
		checkoutFetcher.submit(formData, {
			method: "post",
			action: "/api/checkout",
		});
	};

	return (
		<div className="space-y-6">
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
				<PageHeader
					icon={<DiamondIcon className="w-5 h-5 text-hyper-green" />}
					title="Pricing"
				/>
				<div className="flex items-center gap-2 text-sm text-muted">
					<span>Show prices in</span>
					<CurrencyToggle value={currency} onChange={setCurrency} />
				</div>
			</div>
			<p className="text-sm text-muted">
				Free plan for getting started. Crew Member unlocks unlimited capacity.
			</p>

			{!loaderData.welcomeVoucherRedeemed && (
				<div className="glass-panel rounded-xl p-4 border border-hyper-green/30">
					<p className="text-sm text-carbon">
						New accounts get a free Supply Run pack (65 credits) — use code{" "}
						<span className="font-bold text-hyper-green">
							{loaderData.welcomePromoCode}
						</span>{" "}
						with Supply Run only at checkout.
					</p>
				</div>
			)}

			{checkoutFetcher.data?.error && checkoutFetcher.state === "idle" && (
				<div
					className="glass-panel rounded-xl p-4 border border-danger/40 bg-danger/5"
					role="alert"
				>
					<p className="text-sm text-carbon">
						{checkoutFetcher.data.error}{" "}
						<button
							type="button"
							onClick={() => checkoutFetcher.reset()}
							className="text-hyper-green hover:underline ml-1"
						>
							Dismiss
						</button>
					</p>
				</div>
			)}

			{clientSecret && (
				<div ref={checkoutSectionRef} className="glass-panel rounded-xl p-2">
					<div className="relative z-10 flex justify-end">
						<button
							type="button"
							onClick={closeCheckout}
							className="text-xs text-muted hover:text-carbon px-2 py-1 transition-colors"
						>
							Close checkout
						</button>
					</div>
					<EmbeddedCheckoutProvider
						key={clientSecret}
						stripe={stripePromise}
						options={{
							clientSecret,
							onComplete: handleCheckoutComplete,
						}}
					>
						<EmbeddedCheckout />
					</EmbeddedCheckoutProvider>
				</div>
			)}

			<div className="grid md:grid-cols-2 gap-4">
				<div className="glass-panel rounded-xl p-6">
					<h2 className="text-xl font-bold text-carbon mb-1">Free</h2>
					<p className="text-sm text-muted mb-4">Personal Cargo starter tier</p>
					<ul className="space-y-2 text-sm text-carbon">
						<li>Cargo items: {loaderData.tierLimits.free.maxInventoryItems}</li>
						<li>Meals: {loaderData.tierLimits.free.maxMeals}</li>
						<li>{loaderData.tierLimits.free.maxGroceryLists} supply lists</li>
						<li>No member invites</li>
					</ul>
					<div className="mt-4 text-xs text-muted">
						Current usage: {loaderData.counts.inventory} items,{" "}
						{loaderData.counts.meals} meals
					</div>
				</div>

				<div className="glass-panel rounded-xl p-6 border border-hyper-green/40">
					<h2 className="text-xl font-bold text-carbon mb-1">Crew Member</h2>
					<p className="text-sm text-muted mb-4">
						Unlimited capacity and groups. Annual includes 65 credits; Monthly
						has no included credits — use WELCOME65 with Supply Run only or buy
						packs.
					</p>
					<ul className="space-y-2 text-sm text-carbon">
						<li>Unlimited Cargo items and meals</li>
						<li>Shared supply lists and member invites</li>
						<li>
							Annual:{" "}
							{
								loaderData.subscriptionProducts.CREW_MEMBER_ANNUAL
									.creditsOnStart
							}{" "}
							credits on start and renewal
						</li>
						<li>Monthly: No included credits</li>
					</ul>
					{loaderData.userTier === "crew_member" ? (
						<div className="mt-5 space-y-1">
							<p className="text-sm font-medium text-hyper-green">Your plan</p>
							{loaderData.tierExpiresAt ? (
								<p className="text-xs text-muted">
									{loaderData.subscriptionCancelAtPeriodEnd
										? "Ends on "
										: "Renews on "}
									{(loaderData.tierExpiresAt instanceof Date
										? loaderData.tierExpiresAt
										: new Date(loaderData.tierExpiresAt)
									).toLocaleDateString(undefined, {
										dateStyle: "long",
									})}
								</p>
							) : (
								<p className="text-xs text-muted">Active</p>
							)}
						</div>
					) : (
						<div className="mt-5 flex flex-col sm:flex-row gap-2">
							<button
								type="button"
								onClick={() => startCrewCheckout("CREW_MEMBER_ANNUAL")}
								className="flex-1 px-4 py-2 bg-hyper-green text-carbon font-bold rounded-lg transition-all hover:opacity-90 active:scale-95"
							>
								{
									loaderData.subscriptionProducts.CREW_MEMBER_ANNUAL[
										currency === "USD" ? "priceUsd" : "priceEur"
									]
								}
								<span className="ml-1 text-xs font-normal opacity-90">
									(Save 50%)
								</span>
							</button>
							<button
								type="button"
								onClick={() => startCrewCheckout("CREW_MEMBER_MONTHLY")}
								className="flex-1 px-4 py-2 btn-secondary font-semibold rounded-lg active:scale-95"
							>
								{
									loaderData.subscriptionProducts.CREW_MEMBER_MONTHLY[
										currency === "USD" ? "priceUsd" : "priceEur"
									]
								}
							</button>
						</div>
					)}
				</div>
			</div>

			<div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
				{(
					Object.entries(loaderData.creditPacks) as Array<
						[
							keyof typeof loaderData.creditPacks,
							(typeof loaderData.creditPacks)[keyof typeof loaderData.creditPacks],
						]
					>
				).map(([packKey, pack]) => (
					<div key={packKey} className="glass-panel rounded-xl p-4">
						<div className="flex items-center gap-2">
							<span className="text-sm font-semibold text-carbon">
								{pack.displayName}
							</span>
							{pack.badge && (
								<span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-hyper-green/20 text-hyper-green">
									{pack.badge}
								</span>
							)}
						</div>
						<div className="text-2xl font-bold text-carbon mt-1">
							{pack[currency === "USD" ? "priceUsd" : "priceEur"]}
						</div>
						<div className="text-xs text-muted mt-1">
							{pack.credits} credits
						</div>
						<div className="text-xs text-muted mt-1">{pack.description}</div>
						<button
							type="button"
							onClick={() => startCreditCheckout(packKey)}
							className="mt-3 w-full px-3 py-2 bg-hyper-green text-carbon rounded-lg text-sm font-bold transition-all hover:opacity-90 active:scale-95"
						>
							Buy Credits
						</button>
					</div>
				))}
			</div>

			{/* Feature matrix */}
			<div className="glass-panel rounded-2xl overflow-hidden">
				<div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
					<table className="w-full min-w-[32rem] text-sm">
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
							<FeatureRow label="Expiry alerts & domain filters" free crew />
							<FeatureRow label="Semantic search & smart filters" free crew />
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
			</div>
		</div>
	);
}
