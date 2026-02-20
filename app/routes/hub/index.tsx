import { drizzle } from "drizzle-orm/d1";
import { WelcomeBanner } from "~/components/hub/WelcomeBanner";
import { LayoutEngine } from "~/components/hub/widgets/LayoutEngine";
import { resolveLayout } from "~/components/hub/widgets/registry";
import { HomeIcon } from "~/components/icons/PageIcons";
import { PageHeader } from "~/components/shell/PageHeader";
import * as schema from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { getCargoStats, getExpiringCargo } from "~/lib/cargo.server";
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

	// Get user settings for expiration alert days
	const drizzleDb = drizzle(db, { schema });
	const userData = await drizzleDb.query.user.findFirst({
		where: (u, { eq }) => eq(u.id, user.id),
	});
	const settings = (userData?.settings as UserSettings) || {};
	const expirationAlertDays = settings.expirationAlertDays ?? 7;
	const hubProfile = settings.hubProfile;
	const hubLayout = settings.hubLayout;

	// Fetch all Hub data in parallel
	const [expiringItems, cargoStats, latestSupplyList, mealMatches] =
		await Promise.all([
			getExpiringCargo(db, groupId, expirationAlertDays, 10),
			getCargoStats(db, groupId),
			getSupplyList(db, groupId),
			matchMeals(db, groupId, { mode: "delta", minMatch: 50, limit: 6 }),
		]);

	return {
		expiringItems,
		cargoStats,
		latestSupplyList,
		mealMatches,
		expirationAlertDays,
		hubProfile,
		hubLayout,
		welcomeVoucherRedeemed: userData?.welcomeVoucherRedeemed ?? false,
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
		welcomeVoucherRedeemed,
	} = loaderData;
	const resolvedLayout = resolveLayout(hubProfile, hubLayout);
	const widgetData = {
		cargoStats,
		expirationAlertDays,
		expiringItems,
		latestSupplyList,
		mealMatches,
	};

	return (
		<>
			{/* Mobile Header */}
			<PageHeader
				icon={<HomeIcon className="w-6 h-6 text-hyper-green" />}
				title="Hub"
				itemCount={cargoStats.totalItems}
			/>

			<div className="space-y-8">
				{!welcomeVoucherRedeemed && <WelcomeBanner promoCode="WELCOME60" />}

				<LayoutEngine layout={resolvedLayout} data={widgetData} />
			</div>
		</>
	);
}
