import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { lazy, Suspense, useEffect, useState } from "react";
import {
	NavLink,
	Outlet,
	redirect,
	useNavigate,
	useRouteLoaderData,
} from "react-router";
import { SettingsIcon } from "~/components/icons/PageIcons";
import { OnboardingTour } from "~/components/onboarding";
import { BottomNav, RailSidebar } from "~/components/shell";
import { ConfirmDialog } from "~/components/shell/ConfirmDialog";
import { GroupSwitcher } from "~/components/shell/GroupSwitcher";
import { PwaInstallPrompt } from "~/components/shell/PwaInstallPrompt";
import { ThemeToggle } from "~/components/shell/ThemeToggle";
import { UnitDisplayModeProvider } from "~/components/shell/UnitDisplayToggle";
import { AskLauncherButton } from "~/components/support/AskLauncherButton";
import * as schema from "~/db/schema";
import { getUserSettings, requireActiveGroup } from "~/lib/auth.server";
import {
	checkCapacityWithTier,
	getGroupTierLimits,
} from "~/lib/capacity.server";
import { ConfirmProvider } from "~/lib/confirm-context";
import { isCopilotExhausted } from "~/lib/copilot/exhaustion";
import { getCopilotStatus } from "~/lib/copilot/gate.server";
import { runRouteLoader } from "~/lib/error-handler";
import {
	buildFlagContext,
	isFeatureEnabled,
} from "~/lib/feature-flags/flags.server";
import { AI_COSTS, checkBalance } from "~/lib/ledger.server";
import { log } from "~/lib/logging.server";
import { registerServiceWorker } from "~/lib/pwa.client";
import { resolveUnitDisplayMode } from "~/lib/unit-display-mode";
import type { Route } from "./+types/hub";

const AskPanel = lazy(() =>
	import("~/components/support/AskPanel").then((module) => ({
		default: module.AskPanel,
	})),
);

type RootLoaderHeaderSlice = {
	user?: { id: string } | null;
	clientFlags?: { rationCopilot?: boolean };
};

export function shouldRevalidate({
	nextUrl,
	formAction,
	defaultShouldRevalidate,
}: {
	nextUrl: URL;
	formAction?: string;
	defaultShouldRevalidate: boolean;
}) {
	// Always revalidate after checkout so tier/credits update immediately.
	if (nextUrl.searchParams.get("transaction") === "success") return true;

	// Settings, checkout, webhooks, and AI-credit endpoints must always revalidate
	// because they mutate balance, tier, logo, or onboarding state that the hub
	// shell displays.
	const alwaysRevalidate = [
		"/hub",
		"/hub/settings",
		"/hub/checkout/return",
		"/api/checkout",
		"/api/webhook",
		"/api/scan",
		"/api/meals/generate",
		"/api/meals/import",
		"/api/copilot/consent",
	];
	if (alwaysRevalidate.some((p) => formAction?.startsWith(p))) return true;

	// Cargo, supply, galley, and manifest form actions cannot change shell-visible
	// state (org logo, tier, credit balance, onboarding step). Suppress the hub
	// loader re-run to avoid the redundant auth + KV round-trips on every CRUD action.
	const suppressRoutes = [
		"/hub/cargo",
		"/hub/supply",
		"/hub/galley",
		"/hub/manifest",
	];
	if (suppressRoutes.some((p) => formAction?.startsWith(p))) return false;

	return defaultShouldRevalidate;
}

export async function loader({ request, context }: Route.LoaderArgs) {
	return runRouteLoader(async () => {
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
				const stripeSession =
					await stripe.checkout.sessions.retrieve(sessionId);
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

		const tierInfo = await getGroupTierLimits(context.cloudflare.env, groupId);
		const flagContext = buildFlagContext(
			request,
			context.cloudflare.env,
			session,
		);
		const copilotEnabled = await isFeatureEnabled(
			context.cloudflare.env,
			"ration-copilot",
			flagContext,
		);
		const db = drizzle(context.cloudflare.env.DB, { schema });
		const [
			orgRow,
			balance,
			cargoCapacity,
			mealsCapacity,
			listCapacity,
			userSettings,
			copilotStatus,
		] = await Promise.all([
			db
				.select({ logo: schema.organization.logo })
				.from(schema.organization)
				.where(eq(schema.organization.id, groupId))
				.limit(1)
				.then((rows) => rows[0]),
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
			getUserSettings(context.cloudflare.env.DB, session.user.id),
			copilotEnabled
				? getCopilotStatus(context.cloudflare.env, {
						userId: session.user.id,
						organizationId: groupId,
						tier: tierInfo.tier,
					})
				: Promise.resolve(null),
		]);

		return {
			activeOrganizationLogo: orgRow?.logo ?? null,
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
			unitDisplayMode: resolveUnitDisplayMode(userSettings),
			copilotStatus,
		};
	});
}

export default function DashboardLayout({ loaderData }: Route.ComponentProps) {
	const { onboardingCompletedAt, onboardingStep, copilotStatus } = loaderData;
	const [isAskOpen, setIsAskOpen] = useState(false);
	const [hasAskMounted, setHasAskMounted] = useState(false);
	const navigate = useNavigate();

	const root = useRouteLoaderData("root") as RootLoaderHeaderSlice | undefined;
	const showAskLauncher = Boolean(
		root?.user?.id && root?.clientFlags?.rationCopilot,
	);
	const copilotExhausted = isCopilotExhausted(copilotStatus);

	useEffect(() => {
		registerServiceWorker();
	}, []);

	useEffect(() => {
		if (isAskOpen) setHasAskMounted(true);
	}, [isAskOpen]);

	useEffect(() => {
		const openAsk = () => setIsAskOpen(true);
		window.addEventListener("ration:open-ask", openAsk);
		return () => window.removeEventListener("ration:open-ask", openAsk);
	}, []);

	return (
		<ConfirmProvider>
			<UnitDisplayModeProvider>
				<div className="flex min-h-screen bg-ceramic">
					{/* Desktop Rail Sidebar */}
					<RailSidebar />

					{/* Main Content Area */}
					<main className="flex-1 pb-20 md:pb-0 pt-0 min-w-0">
						{/* Global Top Bar (Group Context) */}
						<header className="px-4 md:px-8 py-2 safe-area-pt flex justify-between items-center gap-3 bg-ceramic/80 backdrop-blur-md sticky top-0 z-40 border-b border-platinum/50 min-h-[3rem]">
							<div className="min-w-0 flex-1 flex items-center gap-3">
								<GroupSwitcher />
							</div>
							<div
								className="flex items-center shrink-0 rounded-xl border border-platinum/60 dark:border-white/10 bg-platinum/35 dark:bg-white/[0.06] p-1 shadow-sm"
								role="toolbar"
								aria-label="Hub actions"
							>
								{showAskLauncher ? (
									<>
										<AskLauncherButton
											disabled={copilotExhausted}
											onClick={() => setIsAskOpen(true)}
											onDisabledClick={() => navigate("/hub/pricing")}
										/>
										<span
											className="w-px h-7 shrink-0 self-center bg-platinum/90 dark:bg-white/15 mx-1"
											aria-hidden
										/>
									</>
								) : null}
								<NavLink
									to="/hub/settings"
									className={({ isActive }) =>
										`flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg transition-colors ${
											isActive
												? "text-hyper-green bg-hyper-green/15"
												: "text-muted hover:text-carbon hover:bg-platinum/70 dark:hover:bg-white/10"
										}`
									}
									aria-label="System settings"
								>
									<SettingsIcon className="w-4 h-4" />
								</NavLink>
								<span
									className="hidden md:block w-px h-7 shrink-0 self-center bg-platinum/90 dark:bg-white/15 mx-1"
									aria-hidden
								/>
								<div className="hidden md:flex items-center pr-0.5">
									<ThemeToggle variant="toolbar" />
								</div>
							</div>
						</header>

						{/* Content */}
						<div className="px-4 md:px-8 py-6">
							<Outlet />
						</div>
					</main>

					{/* Mobile Bottom Nav */}
					<BottomNav />
					<PwaInstallPrompt />
				</div>
				<ConfirmDialog />
				<OnboardingTour
					initialStep={onboardingStep}
					isCompleted={Boolean(onboardingCompletedAt)}
				/>
				{hasAskMounted ? (
					<Suspense fallback={null}>
						<AskPanel isOpen={isAskOpen} onClose={() => setIsAskOpen(false)} />
					</Suspense>
				) : null}
			</UnitDisplayModeProvider>
		</ConfirmProvider>
	);
}
