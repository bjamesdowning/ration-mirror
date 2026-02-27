import { drizzle } from "drizzle-orm/d1";
import { NavLink, Outlet, redirect } from "react-router";
import { SettingsIcon } from "~/components/icons/PageIcons";
import { OnboardingTour } from "~/components/onboarding";
import { BottomNav, RailSidebar } from "~/components/shell";
import { ConfirmDialog } from "~/components/shell/ConfirmDialog";
import { GroupSwitcher } from "~/components/shell/GroupSwitcher";
import * as schema from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import {
	checkCapacityWithTier,
	getGroupTierLimits,
} from "~/lib/capacity.server";
import { ConfirmProvider } from "~/lib/confirm-context";
import { AI_COSTS, checkBalance } from "~/lib/ledger.server";
import { log } from "~/lib/logging.server";
import type { UserSettings } from "~/lib/types";
import type { Route } from "./+types/hub";

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
	const { groupId, session } = await requireActiveGroup(context, request);

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
			throw redirect("/hub/settings?transaction=failed");
		}
	}

	const db = drizzle(context.cloudflare.env.DB, { schema });
	const tierInfo = await getGroupTierLimits(context.cloudflare.env, groupId);
	const [balance, cargoCapacity, mealsCapacity, listCapacity, userData] =
		await Promise.all([
			checkBalance(context.cloudflare.env, groupId),
			checkCapacityWithTier(
				context.cloudflare.env,
				groupId,
				"cargo",
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
				"supplyLists",
				tierInfo,
				0,
			),
			db.query.user.findFirst({
				where: (u, { eq }) => eq(u.id, session.user.id),
				columns: { settings: true },
			}),
		]);

	const userSettings = (userData?.settings as UserSettings) ?? {};

	return {
		balance,
		/** Credit cost per AI feature; keep in sync with ledger.server.ts AI_COSTS */
		aiCosts: {
			SCAN: AI_COSTS.SCAN,
			MEAL_GENERATE: AI_COSTS.MEAL_GENERATE,
			IMPORT_URL: AI_COSTS.IMPORT_URL,
		},
		tier: tierInfo.tier,
		isTierExpired: tierInfo.isExpired,
		capacity: {
			cargo: {
				current: cargoCapacity.current,
				limit: cargoCapacity.limit,
			},
			meals: {
				current: mealsCapacity.current,
				limit: mealsCapacity.limit,
			},
			supplyLists: {
				current: listCapacity.current,
				limit: listCapacity.limit,
			},
		},
		onboardingCompletedAt: userSettings.onboardingCompletedAt ?? null,
		onboardingStep: userSettings.onboardingStep ?? 0,
	};
}

export default function DashboardLayout({ loaderData }: Route.ComponentProps) {
	const { onboardingCompletedAt, onboardingStep } = loaderData;

	return (
		<ConfirmProvider>
			<div className="flex min-h-screen bg-ceramic">
				{/* Desktop Rail Sidebar */}
				<RailSidebar />

				{/* Main Content Area */}
				<main className="flex-1 pb-20 md:pb-0 pt-0 min-w-0">
					{/* Global Top Bar (Group Context) */}
					<header className="px-4 md:px-8 py-3 flex justify-between items-center bg-ceramic/80 backdrop-blur-md sticky top-0 z-40 border-b border-platinum/50 h-16">
						<GroupSwitcher />
						<NavLink
							to="/hub/settings"
							className={({ isActive }) =>
								`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
									isActive
										? "text-hyper-green bg-hyper-green/10"
										: "text-muted hover:text-carbon hover:bg-platinum/60"
								}`
							}
							aria-label="System settings"
						>
							<SettingsIcon className="w-4 h-4" />
							<span className="hidden sm:inline">System</span>
						</NavLink>
					</header>

					{/* Content */}
					<div className="px-4 md:px-8 py-6">
						<Outlet />
					</div>
				</main>

				{/* Mobile Bottom Nav */}
				<BottomNav />
			</div>
			<ConfirmDialog />
			<OnboardingTour
				initialStep={onboardingStep}
				isCompleted={Boolean(onboardingCompletedAt)}
			/>
		</ConfirmProvider>
	);
}
