import { drizzle } from "drizzle-orm/d1";
import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { ExpiringItemsCard } from "~/components/dashboard/ExpiringItemsCard";
import { GroceryPreviewCard } from "~/components/dashboard/GroceryPreviewCard";
import { MealSuggestionsCard } from "~/components/dashboard/MealSuggestionsCard";
import {
	ClockIcon,
	GroceryIcon,
	PantryIcon,
	SuccessIcon,
} from "~/components/icons/DashboardIcons";
import * as schema from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { getLatestGroceryList } from "~/lib/grocery.server";
import { getExpiringItems, getInventoryStats } from "~/lib/inventory.server";
import { matchMeals } from "~/lib/matching.server";
import type { Route } from "./+types/index";

interface UserSettings {
	unitSystem?: "metric" | "imperial";
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
	const [expiringItems, inventoryStats, latestGroceryList, mealMatches] =
		await Promise.all([
			getExpiringItems(db, groupId, expirationAlertDays, 10),
			getInventoryStats(db, groupId),
			getLatestGroceryList(db, groupId),
			matchMeals(db, groupId, { mode: "delta", minMatch: 50, limit: 6 }),
		]);

	return {
		expiringItems,
		inventoryStats,
		latestGroceryList,
		mealMatches,
		expirationAlertDays,
	};
}

// --- COMPONENT ---
export default function DashboardHub({ loaderData }: Route.ComponentProps) {
	const {
		expiringItems,
		inventoryStats,
		latestGroceryList,
		mealMatches,
		expirationAlertDays,
	} = loaderData;

	return (
		<>
			<DashboardHeader
				title="Hub"
				subtitle="Mission Control // Overview"
				showSearch={false}
				totalItems={inventoryStats.totalItems}
			/>

			<div className="space-y-8">
				{/* Quick Stats Bar */}
				<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
					<StatCard
						label="Pantry Items"
						value={inventoryStats.totalItems}
						icon={<PantryIcon />}
					/>
					<StatCard
						label="Expiring Soon"
						value={inventoryStats.expiringCount}
						icon={<ClockIcon />}
						highlight={inventoryStats.expiringCount > 0}
					/>
					<StatCard
						label="Recipes Ready"
						value={mealMatches.filter((m) => m.canMake).length}
						icon={<SuccessIcon />}
					/>
					<StatCard
						label="Grocery Items"
						value={latestGroceryList?.items.length || 0}
						icon={<GroceryIcon />}
					/>
				</div>

				{/* Main Content: Meal Suggestions */}
				<MealSuggestionsCard meals={mealMatches} />

				{/* Secondary Row: Expiring + Grocery */}
				<div className="grid md:grid-cols-2 gap-6">
					<ExpiringItemsCard
						items={expiringItems}
						alertDays={expirationAlertDays}
					/>
					<GroceryPreviewCard list={latestGroceryList} />
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
					className={`text-2xl font-bold ${highlight ? "text-warning" : "text-carbon"}`}
				>
					{value}
				</p>
			</div>
		</div>
	);
}
