import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { getGroupTierLimits } from "~/lib/capacity.server";
import { getCargoStats } from "~/lib/cargo.server";
import { checkBalance } from "~/lib/ledger.server";
import { getMealsCount } from "~/lib/meals.server";
import { getSupplyList } from "~/lib/supply.server";

export async function getMobileDashboard(
	env: Cloudflare.Env,
	organizationId: string,
) {
	const [cargoStats, mealCount, credits, tierInfo, supplyList] =
		await Promise.all([
			getCargoStats(env.DB, organizationId),
			getMealsCount(env.DB, organizationId),
			checkBalance(env, organizationId),
			getGroupTierLimits(env, organizationId),
			getSupplyList(env.DB, organizationId),
		]);

	const supplyItems = supplyList?.items ?? [];
	const uncheckedSupply = supplyItems.filter(
		(item) => !item.isPurchased,
	).length;

	return {
		cargo: cargoStats,
		meals: { total: mealCount },
		supply: {
			totalItems: supplyItems.length,
			uncheckedItems: uncheckedSupply,
			listId: supplyList?.id ?? null,
		},
		credits,
		tier: tierInfo.tier,
		isTierExpired: tierInfo.isExpired,
	};
}

export async function getOrganizationRecord(
	env: Cloudflare.Env,
	organizationId: string,
) {
	const db = drizzle(env.DB, { schema });
	return db.query.organization.findFirst({
		where: eq(schema.organization.id, organizationId),
		columns: {
			id: true,
			name: true,
			slug: true,
			logo: true,
			credits: true,
		},
	});
}
