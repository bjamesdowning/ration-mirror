import { drizzle } from "drizzle-orm/d1";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { HubEditMode } from "~/components/hub/HubEditMode";
import { WelcomeBanner } from "~/components/hub/WelcomeBanner";
import { LayoutEngine } from "~/components/hub/widgets/LayoutEngine";
import { resolveLayout } from "~/components/hub/widgets/registry";
import { HomeIcon } from "~/components/icons/PageIcons";
import * as schema from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { getCargoStats, getExpiringCargo } from "~/lib/cargo.server";
import { getManifestPreview } from "~/lib/manifest.server";
import { matchMeals } from "~/lib/matching.server";
import { getSupplyList } from "~/lib/supply.server";
import type { UserSettings } from "~/lib/types";
import type { Route } from "./+types/index";

// --- LOADER ---
export async function loader({ request, context }: Route.LoaderArgs) {
	const {
		session: { user },
		groupId,
	} = await requireActiveGroup(context, request);
	const db = context.cloudflare.env.DB;

	const drizzleDb = drizzle(db, { schema });
	const userData = await drizzleDb.query.user.findFirst({
		where: (u, { eq }) => eq(u.id, user.id),
	});
	const settings = (userData?.settings as UserSettings) || {};
	const expirationAlertDays = settings.expirationAlertDays ?? 7;
	const hubProfile = settings.hubProfile;
	const hubLayout = settings.hubLayout;

	// Fast data — awaited immediately; page shell renders right away
	const [expiringItems, cargoStats, latestSupplyList, manifestPreview] =
		await Promise.all([
			getExpiringCargo(db, groupId, expirationAlertDays, 10),
			getCargoStats(db, groupId),
			getSupplyList(db, groupId),
			getManifestPreview(db, groupId, 7),
		]);

	// Deferred — raw promises; meal/snack widgets show skeletons until resolved
	// preLimit: 12 caps meals matched; bounds vector work for large orgs
	const mealMatches = matchMeals(context.cloudflare.env, groupId, {
		mode: "delta",
		minMatch: 50,
		limit: 6,
		preLimit: 12,
		type: "recipe",
		domain: "food",
	});
	const snackMatches = matchMeals(context.cloudflare.env, groupId, {
		mode: "delta",
		minMatch: 50,
		limit: 6,
		preLimit: 12,
		type: "provision",
		domain: "food",
	});

	return {
		expiringItems,
		cargoStats,
		latestSupplyList,
		manifestPreview,
		expirationAlertDays,
		hubProfile,
		hubLayout,
		welcomeVoucherRedeemed: userData?.welcomeVoucherRedeemed ?? false,
		mealMatches,
		snackMatches,
	};
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
		snackMatches,
		manifestPreview,
		welcomeVoucherRedeemed,
	} = loaderData;

	const [searchParams] = useSearchParams();
	const [isEditing, setIsEditing] = useState(
		() => searchParams.get("edit") === "1",
	);

	const resolvedLayout = resolveLayout(hubProfile, hubLayout);
	const widgetData = {
		cargoStats,
		expirationAlertDays,
		expiringItems,
		latestSupplyList,
		mealMatches,
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
				{!welcomeVoucherRedeemed && <WelcomeBanner promoCode="WELCOME60" />}

				{isEditing ? (
					<HubEditMode
						hubProfile={hubProfile}
						hubLayout={hubLayout}
						data={widgetData}
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
