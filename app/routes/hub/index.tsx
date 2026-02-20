import { drizzle } from "drizzle-orm/d1";
import { ExpiringCargoCard } from "~/components/hub/ExpiringCargoCard";
import { MealSuggestionsCard } from "~/components/hub/MealSuggestionsCard";
import { SupplyPreviewCard } from "~/components/hub/SupplyPreviewCard";
import { WelcomeBanner } from "~/components/hub/WelcomeBanner";
import {
	ClockIcon,
	GroceryIcon,
	PantryIcon,
	SuccessIcon,
} from "~/components/icons/HubIcons";
import { HomeIcon } from "~/components/icons/PageIcons";
import { PageHeader } from "~/components/shell/PageHeader";
import * as schema from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { getCargoStats, getExpiringCargo } from "~/lib/cargo.server";
import { matchMeals } from "~/lib/matching.server";
import { getSupplyList } from "~/lib/supply.server";
import type { Route } from "./+types/index";

interface UserSettings {
	expirationAlertDays?: number;
}

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
	const expirationAlertDays = settings.expirationAlertDays || 7;

	// Fetch all dashboard data in parallel
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
		welcomeVoucherRedeemed: userData?.welcomeVoucherRedeemed ?? false,
	};
}

// --- COMPONENT ---
export default function DashboardHub({ loaderData }: Route.ComponentProps) {
	const {
		expiringItems,
		cargoStats,
		latestSupplyList,
		mealMatches,
		expirationAlertDays,
		welcomeVoucherRedeemed,
	} = loaderData;

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

				{/* Quick Stats Bar */}
				<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
					<StatCard
						label="Cargo Items"
						value={cargoStats.totalItems}
						icon={<PantryIcon />}
					/>
					<StatCard
						label="Expiring Soon"
						value={cargoStats.expiringCount}
						icon={<ClockIcon />}
						highlight={cargoStats.expiringCount > 0}
					/>
					<StatCard
						label="Meals Ready"
						value={mealMatches.filter((m) => m.canMake).length}
						icon={<SuccessIcon />}
					/>
					<StatCard
						label="Supply Items"
						value={latestSupplyList?.items.length || 0}
						icon={<GroceryIcon />}
					/>
				</div>

				{/* Main Content: Meal Suggestions */}
				<MealSuggestionsCard meals={mealMatches} />

				{/* Secondary Row: Expiring + Grocery */}
				<div className="grid md:grid-cols-2 gap-6">
					<ExpiringCargoCard
						items={expiringItems}
						alertDays={expirationAlertDays}
					/>
					<SupplyPreviewCard list={latestSupplyList} />
				</div>
			</div>
		</>
	);
}

// --- STAT CARD COMPONENT ---
interface StatCardProps {
	label: string;
	value: number;
	icon: React.ReactNode;
	highlight?: boolean;
}

function StatCard({ label, value, icon, highlight }: StatCardProps) {
	return (
		<div
			className={`glass-panel rounded-xl p-4 flex items-center gap-3 ${
				highlight ? "border-2 border-warning" : ""
			}`}
		>
			{icon}
			<div>
				<p className="text-xs text-muted uppercase tracking-wider">{label}</p>
				<p
					className={`text-2xl font-bold ${highlight ? "text-warning" : "text-carbon dark:text-white"}`}
				>
					{value}
				</p>
			</div>
		</div>
	);
}
