import {
	EmbeddedCheckout,
	EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { useMemo, useState } from "react";
import { data, useFetcher, useNavigate } from "react-router";
import { DiamondIcon } from "~/components/icons/PageIcons";
import { PageHeader } from "~/components/shell/PageHeader";
import * as schema from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { getGroupTierLimits } from "~/lib/capacity.server";
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

	const [userRow, inventoryCount, mealCount, listCount, tierLimits] =
		await Promise.all([
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
			getGroupTierLimits(context.cloudflare.env, groupId),
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
		limits: tierLimits.limits,
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
							onClick={() => setClientSecret(null)}
							className="text-xs text-muted hover:text-carbon px-2 py-1"
						>
							Close checkout
						</button>
					</div>
					<EmbeddedCheckoutProvider
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
							className="mt-5 px-4 py-2 bg-hyper-green text-carbon font-bold rounded-lg"
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
						{pack.badge && (
							<span className="inline-block mt-2 text-[10px] bg-hyper-green/10 text-hyper-green px-2 py-0.5 rounded-full">
								{pack.badge}
							</span>
						)}
						<button
							type="button"
							onClick={() => startCreditCheckout(packKey)}
							className="mt-3 w-full px-3 py-2 bg-platinum text-carbon rounded-lg text-sm font-medium"
						>
							Buy Credits
						</button>
					</div>
				))}
			</div>
		</div>
	);
}
