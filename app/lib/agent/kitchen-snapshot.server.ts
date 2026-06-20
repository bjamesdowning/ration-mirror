import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import { checkCapacityWithTier, getGroupTierLimits } from "../capacity.server";
import { checkBalance } from "../ledger.server";
import type { TierLimits, TierSlug } from "../tiers.server";

export interface AgentResourceCapacity {
	current: number;
	limit: number;
	canAdd: number;
}

export interface AgentKitchenSnapshot {
	tier: TierSlug;
	tierExpired: boolean;
	limits: Pick<
		TierLimits,
		"maxInventoryItems" | "maxMeals" | "maxGroceryLists"
	>;
	capacity: {
		cargo: AgentResourceCapacity;
		meals: AgentResourceCapacity;
		supplyLists: AgentResourceCapacity;
	};
	credits: number;
	lastActivityAt: string | null;
}

function toCapacitySnapshot(result: {
	current: number;
	limit: number;
	canAdd: number;
}): AgentResourceCapacity {
	return {
		current: result.current,
		limit: result.limit,
		canAdd: Number.isFinite(result.canAdd) ? result.canAdd : -1,
	};
}

/** Pick the latest timestamp and return ISO-8601 (or null). */
export function pickLatestActivityIso(
	candidates: Array<Date | null | undefined>,
): string | null {
	let latestMs = Number.NEGATIVE_INFINITY;
	for (const value of candidates) {
		if (!value) continue;
		const ms = value.getTime();
		if (!Number.isNaN(ms) && ms > latestMs) {
			latestMs = ms;
		}
	}
	return Number.isFinite(latestMs) && latestMs > Number.NEGATIVE_INFINITY
		? new Date(latestMs).toISOString()
		: null;
}

async function resolveLastActivityAt(
	env: Cloudflare.Env,
	organizationId: string,
): Promise<string | null> {
	const db = drizzle(env.DB, { schema });

	const [cargoMax, mealMax, supplyMax, planMax, orgRow, registration] =
		await Promise.all([
			db
				.select({ ts: sql<number | null>`max(${schema.cargo.updatedAt})` })
				.from(schema.cargo)
				.where(eq(schema.cargo.organizationId, organizationId))
				.then((rows) => rows[0]?.ts ?? null),
			db
				.select({ ts: sql<number | null>`max(${schema.meal.updatedAt})` })
				.from(schema.meal)
				.where(eq(schema.meal.organizationId, organizationId))
				.then((rows) => rows[0]?.ts ?? null),
			db
				.select({ ts: sql<number | null>`max(${schema.supplyList.updatedAt})` })
				.from(schema.supplyList)
				.where(eq(schema.supplyList.organizationId, organizationId))
				.then((rows) => rows[0]?.ts ?? null),
			db
				.select({ ts: sql<number | null>`max(${schema.mealPlan.updatedAt})` })
				.from(schema.mealPlan)
				.where(eq(schema.mealPlan.organizationId, organizationId))
				.then((rows) => rows[0]?.ts ?? null),
			db.query.organization.findFirst({
				where: eq(schema.organization.id, organizationId),
				columns: { createdAt: true },
			}),
			db.query.agentRegistration.findFirst({
				where: eq(schema.agentRegistration.organizationId, organizationId),
				columns: { createdAt: true },
			}),
		]);

	const unixToDate = (ts: unknown) => {
		if (ts == null) return null;
		if (ts instanceof Date) return ts;
		if (typeof ts === "number") {
			const ms = ts > 1e12 ? ts : ts * 1000;
			const date = new Date(ms);
			return Number.isNaN(date.getTime()) ? null : date;
		}
		return null;
	};

	return pickLatestActivityIso([
		unixToDate(cargoMax),
		unixToDate(mealMax),
		unixToDate(supplyMax),
		unixToDate(planMax),
		orgRow?.createdAt ?? null,
		registration?.createdAt ?? null,
	]);
}

/** Kitchen tier, usage, credits, and activity for get_context onboarding. */
export async function getAgentKitchenSnapshot(
	env: Cloudflare.Env,
	organizationId: string,
): Promise<AgentKitchenSnapshot> {
	const tierInfo = await getGroupTierLimits(env, organizationId);

	const [
		cargoCapacity,
		mealsCapacity,
		supplyCapacity,
		credits,
		lastActivityAt,
	] = await Promise.all([
		checkCapacityWithTier(env, organizationId, "cargo", tierInfo, 0),
		checkCapacityWithTier(env, organizationId, "meals", tierInfo, 0),
		checkCapacityWithTier(env, organizationId, "supplyLists", tierInfo, 0),
		checkBalance(env, organizationId),
		resolveLastActivityAt(env, organizationId),
	]);

	const { tier, limits, isExpired } = tierInfo;

	return {
		tier,
		tierExpired: isExpired,
		limits: {
			maxInventoryItems: limits.maxInventoryItems,
			maxMeals: limits.maxMeals,
			maxGroceryLists: limits.maxGroceryLists,
		},
		capacity: {
			cargo: toCapacitySnapshot(cargoCapacity),
			meals: toCapacitySnapshot(mealsCapacity),
			supplyLists: toCapacitySnapshot(supplyCapacity),
		},
		credits,
		lastActivityAt,
	};
}
