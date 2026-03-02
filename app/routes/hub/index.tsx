import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { useState } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { HubEditMode } from "~/components/hub/HubEditMode";
import { WelcomeBanner } from "~/components/hub/WelcomeBanner";
import { LayoutEngine } from "~/components/hub/widgets/LayoutEngine";
import { resolveLayout } from "~/components/hub/widgets/registry";
import { HomeIcon } from "~/components/icons/PageIcons";
import * as schema from "~/db/schema";
import { getUserSettings, requireActiveGroup } from "~/lib/auth.server";
import { getCargoStats, getExpiringCargo } from "~/lib/cargo.server";
import { getDistinctMealTags, getManifestPreview } from "~/lib/manifest.server";
import { matchMeals } from "~/lib/matching.server";
import { getSupplyList } from "~/lib/supply.server";
import type { Route } from "./+types/index";

// --- LOADER ---
export async function loader({ request, context }: Route.LoaderArgs) {
	const {
		session: { user },
		groupId,
	} = await requireActiveGroup(context, request);
	const db = context.cloudflare.env.DB;

	const settings = await getUserSettings(db, user.id);
	const expirationAlertDays = settings.expirationAlertDays ?? 7;
	const hubProfile = settings.hubProfile;
	const hubLayout = settings.hubLayout;

	// Resolve layout so we can read per-widget filter configs
	const resolvedWidgets = resolveLayout(hubProfile, hubLayout);
	const findWidget = (id: string) => resolvedWidgets.find((w) => w.id === id);

	const mealsReadyConfig = findWidget("meals-ready");
	const mealsPartialConfig = findWidget("meals-partial");
	const snacksReadyConfig = findWidget("snacks-ready");
	const cargoExpiringConfig = findWidget("cargo-expiring");
	const manifestPreviewConfig = findWidget("manifest-preview");

	// Derive per-widget filter values with safe defaults
	const cargoLimit = cargoExpiringConfig?.filters?.limit ?? 10;
	const cargoDomain = cargoExpiringConfig?.filters?.domain;
	const manifestSlotType = manifestPreviewConfig?.filters?.slotType;

	// Fast data — awaited immediately; page shell renders right away
	const [
		expiringItems,
		cargoStats,
		latestSupplyList,
		manifestPreview,
		availableMealTags,
	] = await Promise.all([
		getExpiringCargo(db, groupId, expirationAlertDays, cargoLimit, cargoDomain),
		getCargoStats(db, groupId),
		getSupplyList(db, groupId),
		getManifestPreview(db, groupId, 7, manifestSlotType),
		getDistinctMealTags(db, groupId),
	]);

	// Deferred — raw promises; meal/snack widgets show skeletons until resolved
	// preLimit: 12 caps meals matched; bounds vector work for large orgs
	const mealMatches = matchMeals(context.cloudflare.env, groupId, {
		mode: "delta",
		minMatch: 50,
		limit: mealsReadyConfig?.filters?.limit ?? 6,
		preLimit: 12,
		type: "recipe",
		domain: "food",
		tags: mealsReadyConfig?.filters?.tags,
	});
	const snackMatches = matchMeals(context.cloudflare.env, groupId, {
		mode: "delta",
		minMatch: 50,
		limit: snacksReadyConfig?.filters?.limit ?? 6,
		preLimit: 12,
		type: "provision",
		domain: "food",
		tags: snacksReadyConfig?.filters?.tags,
	});
	// meals-partial shares the meal dataset but applies its own tag/limit filters
	const partialMealMatches = matchMeals(context.cloudflare.env, groupId, {
		mode: "delta",
		minMatch: 50,
		limit: mealsPartialConfig?.filters?.limit ?? 6,
		preLimit: 12,
		type: "recipe",
		domain: "food",
		tags: mealsPartialConfig?.filters?.tags,
	});

	return {
		expiringItems,
		cargoStats,
		latestSupplyList,
		manifestPreview,
		expirationAlertDays,
		hubProfile,
		hubLayout,
		availableMealTags,
		welcomeVoucherRedeemed: user.welcomeVoucherRedeemed ?? false,
		mealMatches,
		partialMealMatches,
		snackMatches,
	};
}

// --- ACTION ---
export async function action({ request, context }: Route.ActionArgs) {
	const {
		session: { user },
	} = await requireActiveGroup(context, request);

	const formData = await request.formData();
	const intent = formData.get("intent");

	if (intent === "dismiss-welcome-banner") {
		const db = drizzle(context.cloudflare.env.DB, { schema });
		await db
			.update(schema.user)
			.set({ welcomeVoucherRedeemed: true })
			.where(eq(schema.user.id, user.id));
		return { success: true };
	}

	return null;
}

// --- COMPONENT ---
export default function DashboardHub({ loaderData }: Route.ComponentProps) {
	const {
		cargoStats,
		expirationAlertDays,
		expiringItems,
		hubProfile,
		hubLayout,
		latestSupplyList,
		mealMatches,
		partialMealMatches,
		snackMatches,
		manifestPreview,
		welcomeVoucherRedeemed,
		availableMealTags,
	} = loaderData;

	const [searchParams] = useSearchParams();
	const [isEditing, setIsEditing] = useState(
		() => searchParams.get("edit") === "1",
	);
	const dismissFetcher = useFetcher();
	// Optimistic: hide the banner as soon as the user dismisses, before the server confirms
	const bannerVisible =
		!welcomeVoucherRedeemed &&
		dismissFetcher.state === "idle" &&
		!dismissFetcher.data;

	const resolvedLayout = resolveLayout(hubProfile, hubLayout);
	const widgetData = {
		cargoStats,
		expirationAlertDays,
		expiringItems,
		latestSupplyList,
		mealMatches,
		partialMealMatches,
		snackMatches,
		manifestPreview,
	};

	return (
		<>
			{/* Page header with Customize button */}
			<header className="mb-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<HomeIcon className="w-6 h-6 text-hyper-green" />
						<h1 className="text-2xl font-bold text-carbon dark:text-white">
							Hub
						</h1>
						<span className="text-sm font-medium text-muted bg-platinum dark:bg-white/10 px-2 py-0.5 rounded-full">
							{cargoStats.totalItems}
						</span>
					</div>

					{!isEditing && (
						<button
							type="button"
							onClick={() => setIsEditing(true)}
							className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted hover:text-carbon dark:hover:text-white bg-platinum/50 dark:bg-white/10 hover:bg-platinum dark:hover:bg-white/20 rounded-lg transition-all"
						>
							<PencilIcon className="w-3.5 h-3.5" />
							Customize
						</button>
					)}
				</div>
			</header>

			<div className="space-y-8">
				{bannerVisible && (
					<WelcomeBanner
						promoCode="WELCOME60"
						onDismiss={() =>
							dismissFetcher.submit(
								{ intent: "dismiss-welcome-banner" },
								{ method: "post" },
							)
						}
					/>
				)}

				{isEditing ? (
					<HubEditMode
						hubProfile={hubProfile}
						hubLayout={hubLayout}
						data={widgetData}
						availableMealTags={availableMealTags}
						onExit={() => setIsEditing(false)}
					/>
				) : (
					<LayoutEngine layout={resolvedLayout} data={widgetData} />
				)}
			</div>
		</>
	);
}

function PencilIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
			/>
		</svg>
	);
}
