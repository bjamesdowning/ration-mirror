import {
	EmbeddedCheckout,
	EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { useMemo, useState } from "react";
import { data, useFetcher, useNavigate } from "react-router";
import { CheckIcon, DiamondIcon } from "~/components/icons/PageIcons";
import { PageHeader } from "~/components/shell/PageHeader";
import * as schema from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { TIER_LIMITS } from "~/lib/tiers.server";
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
		welcomeVoucherRedeemed: userRow?.welcomeVoucherRedeemed ?? false,
		welcomePromoCode: "WELCOME60",
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
	const [clientSecret, setClientSecret] = useState<string | null>(null);
	const [sessionId, setSessionId] = useState<string | null>(null);

	const stripePromise = useMemo(
		() => loadStripe(loaderData.stripePublishableKey),
		[loaderData.stripePublishableKey],
	);

	if (
		checkoutFetcher.data?.success &&
		checkoutFetcher.data.clientSecret &&
		clientSecret !== checkoutFetcher.data.clientSecret
	) {
		setClientSecret(checkoutFetcher.data.clientSecret);
		if (checkoutFetcher.data.sessionId) {
			setSessionId(checkoutFetcher.data.sessionId);
		}
	}

	const handleCheckoutComplete = () => {
		if (sessionId) {
			navigate(`/hub/checkout/return?session_id=${sessionId}`);
		}
	};

	const closeCheckout = () => {
		setClientSecret(null);
		setSessionId(null);
	};

	const startCreditCheckout = (pack: keyof typeof loaderData.creditPacks) => {
		const formData = new FormData();
		formData.append("type", "credits");
		formData.append("pack", pack);
		formData.append("returnUrl", "/hub/checkout/return");
		checkoutFetcher.submit(formData, {
			method: "post",
			action: "/api/checkout",
		});
	};

	const startCrewCheckout = () => {
		const formData = new FormData();
		formData.append("type", "subscription");
		formData.append("subscription", "CREW_MEMBER_ANNUAL");
		formData.append("returnUrl", "/hub/checkout/return");
		checkoutFetcher.submit(formData, {
			method: "post",
			action: "/api/checkout",
		});
	};

	return (
		<div className="space-y-6">
			<PageHeader
				icon={<DiamondIcon className="w-5 h-5 text-hyper-green" />}
				title="Pricing"
			/>
			<p className="text-sm text-muted">
				Free plan for getting started. Crew Member unlocks unlimited capacity.
			</p>

			{!loaderData.welcomeVoucherRedeemed && (
				<div className="glass-panel rounded-xl p-4 border border-hyper-green/30">
					<p className="text-sm text-carbon">
						Welcome voucher: use code{" "}
						<span className="font-bold text-hyper-green">
							{loaderData.welcomePromoCode}
						</span>{" "}
						for a free Supply Run pack.
					</p>
				</div>
			)}

			{clientSecret && (
				<div className="glass-panel rounded-xl p-2">
					<div className="flex justify-end">
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
						<li>Cargo items: 50</li>
						<li>Meals: 20</li>
						<li>1 supply list</li>
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
						{loaderData.subscriptionProducts.CREW_MEMBER_ANNUAL.price} with
						yearly credits
					</p>
					<ul className="space-y-2 text-sm text-carbon">
						<li>Unlimited Cargo items and meals</li>
						<li>Shared supply lists and member invites</li>
						<li>
							{
								loaderData.subscriptionProducts.CREW_MEMBER_ANNUAL
									.creditsOnStart
							}{" "}
							credits on start and renewal
						</li>
					</ul>
					{loaderData.userTier === "crew_member" ? (
						<div className="mt-5 space-y-1">
							<p className="text-sm font-medium text-hyper-green">Your plan</p>
							{loaderData.tierExpiresAt ? (
								<p className="text-xs text-muted">
									Renews on{" "}
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
						<button
							type="button"
							onClick={startCrewCheckout}
							className="mt-5 px-4 py-2 bg-hyper-green text-carbon font-bold rounded-lg transition-all hover:opacity-90 active:scale-95"
						>
							Start Crew Member
						</button>
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
						<div className="text-sm font-semibold text-carbon">
							{pack.displayName}
						</div>
						<div className="text-2xl font-bold text-carbon mt-1">
							{pack.price}
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
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b border-carbon/10">
							<th className="text-left p-4 text-muted font-normal">Feature</th>
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
	);
}
