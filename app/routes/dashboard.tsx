import { Outlet, redirect } from "react-router";
import { BottomNav, RailSidebar } from "~/components/shell";
import { GroupSwitcher } from "~/components/shell/GroupSwitcher";
import { requireActiveGroup } from "~/lib/auth.server";
import {
	checkCapacityWithTier,
	getGroupTierLimits,
} from "~/lib/capacity.server";
import { checkBalance } from "~/lib/ledger.server";
import { log } from "~/lib/logging.server";
import type { Route } from "./+types/dashboard";

export function shouldRevalidate({
	nextUrl,
	defaultShouldRevalidate,
}: {
	nextUrl: URL;
	defaultShouldRevalidate: boolean;
}) {
	// Force layout revalidation when returning from checkout so tier/capacity reflect the purchase
	if (nextUrl.searchParams.get("transaction") === "success") {
		return true;
	}
	return defaultShouldRevalidate;
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);

	// Run checkout fulfillment before tier/capacity fetch when on return URL.
	// Layout runs before child loaders, so fulfillment would otherwise run too late.
	const url = new URL(request.url);
	const sessionId = url.searchParams.get("session_id");
	if (sessionId && url.pathname.endsWith("/checkout/return")) {
		try {
			const { processCheckoutSession, processSubscriptionCheckoutSession } =
				await import("~/lib/ledger.server");
			const { getStripe } = await import("~/lib/stripe.server");
			const stripe = getStripe(context.cloudflare.env);
			const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
			const checkoutType = stripeSession.metadata?.type ?? "credits";
			if (checkoutType === "subscription") {
				await processSubscriptionCheckoutSession(
					context.cloudflare.env,
					sessionId,
				);
			} else {
				await processCheckoutSession(context.cloudflare.env, sessionId);
			}
		} catch (error) {
			log.error("Checkout fulfillment failed", error);
			throw redirect("/dashboard/settings?transaction=failed");
		}
	}

	const tierInfo = await getGroupTierLimits(context.cloudflare.env, groupId);
	const [balance, inventoryCapacity, mealsCapacity, listCapacity] =
		await Promise.all([
			checkBalance(context.cloudflare.env, groupId),
			checkCapacityWithTier(
				context.cloudflare.env,
				groupId,
				"inventory",
				tierInfo,
				0,
			),
			checkCapacityWithTier(
				context.cloudflare.env,
				groupId,
				"meals",
				tierInfo,
				0,
			),
			checkCapacityWithTier(
				context.cloudflare.env,
				groupId,
				"groceryLists",
				tierInfo,
				0,
			),
		]);

	return {
		balance,
		tier: tierInfo.tier,
		isTierExpired: tierInfo.isExpired,
		capacity: {
			inventory: {
				current: inventoryCapacity.current,
				limit: inventoryCapacity.limit,
			},
			meals: {
				current: mealsCapacity.current,
				limit: mealsCapacity.limit,
			},
			groceryLists: {
				current: listCapacity.current,
				limit: listCapacity.limit,
			},
		},
	};
}

export default function DashboardLayout() {
	return (
		<div className="flex min-h-screen bg-ceramic">
			{/* Desktop Rail Sidebar */}
			<RailSidebar />

			{/* Main Content Area */}
			<main className="flex-1 pb-20 md:pb-0 pt-0 min-w-0">
				{/* Global Top Bar (Group Context) */}
				<header className="px-4 md:px-8 py-3 flex justify-between items-center bg-ceramic/80 backdrop-blur-md sticky top-0 z-40 border-b border-platinum/50 h-16">
					<GroupSwitcher />
					{/* Add user profile or other global actions here if needed */}
				</header>

				{/* Content */}
				<div className="px-4 md:px-8 py-6">
					<Outlet />
				</div>
			</main>

			{/* Mobile Bottom Nav */}
			<BottomNav />
		</div>
	);
}
