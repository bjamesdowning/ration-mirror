import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import {
	TIER_LIMITS,
	type TierLimits,
	type TierSlug,
} from "~/lib/tiers.server";

type CapacityResource = "inventory" | "meals" | "groceryLists";

export class CapacityExceededError extends Error {
	override name = "CapacityExceededError" as const;
	resource: CapacityResource;
	current: number;
	limit: number;
	tier: TierSlug;
	isExpired: boolean;
	canAdd: number;

	constructor(options: {
		resource: CapacityResource;
		current: number;
		limit: number;
		tier: TierSlug;
		isExpired: boolean;
		canAdd: number;
	}) {
		super(`Capacity exceeded for ${options.resource}`);
		this.resource = options.resource;
		this.current = options.current;
		this.limit = options.limit;
		this.tier = options.tier;
		this.isExpired = options.isExpired;
		this.canAdd = options.canAdd;
	}
}

function getEffectiveTier(
	tier: TierSlug,
	tierExpiresAt: Date | null,
	now = new Date(),
): { tier: TierSlug; isExpired: boolean } {
	if (
		tier === "crew_member" &&
		tierExpiresAt &&
		tierExpiresAt.getTime() <= now.getTime()
	) {
		return { tier: "free", isExpired: true };
	}

	return { tier, isExpired: false };
}

/**
 * Read tier from D1 (no KV cache). D1 free tier: 10M reads/day vs KV 1K writes/day.
 */
export async function getGroupTierLimits(
	env: Env,
	organizationId: string,
): Promise<{ tier: TierSlug; limits: TierLimits; isExpired: boolean }> {
	const db = drizzle(env.DB, { schema });
	const now = new Date();

	const ownerMember = await db.query.member.findFirst({
		where: and(
			eq(schema.member.organizationId, organizationId),
			eq(schema.member.role, "owner"),
		),
		columns: {
			userId: true,
		},
	});

	if (!ownerMember) {
		return { tier: "free", limits: TIER_LIMITS.free, isExpired: false };
	}

	const owner = await db.query.user.findFirst({
		where: eq(schema.user.id, ownerMember.userId),
		columns: {
			tier: true,
			tierExpiresAt: true,
		},
	});

	const rawTier: TierSlug =
		owner?.tier === "crew_member" ? "crew_member" : "free";
	const tierExpiresAt = owner?.tierExpiresAt ?? null;
	const { tier, isExpired } = getEffectiveTier(rawTier, tierExpiresAt, now);

	return { tier, limits: TIER_LIMITS[tier], isExpired };
}

async function getResourceCount(
	env: Env,
	organizationId: string,
	resource: CapacityResource,
) {
	const db = drizzle(env.DB, { schema });

	if (resource === "inventory") {
		const [result] = await db
			.select({ count: sql<number>`count(*)` })
			.from(schema.inventory)
			.where(eq(schema.inventory.organizationId, organizationId));
		return result?.count ?? 0;
	}

	if (resource === "meals") {
		const [result] = await db
			.select({ count: sql<number>`count(*)` })
			.from(schema.meal)
			.where(eq(schema.meal.organizationId, organizationId));
		return result?.count ?? 0;
	}

	const [result] = await db
		.select({ count: sql<number>`count(*)` })
		.from(schema.groceryList)
		.where(eq(schema.groceryList.organizationId, organizationId));
	return result?.count ?? 0;
}

type TierInfo = {
	tier: TierSlug;
	limits: TierLimits;
	isExpired: boolean;
};

/**
 * Check capacity using pre-fetched tier info (avoids redundant getGroupTierLimits calls).
 */
export async function checkCapacityWithTier(
	env: Env,
	organizationId: string,
	resource: CapacityResource,
	tierInfo: TierInfo,
	addCount = 1,
) {
	const { tier, limits, isExpired } = tierInfo;
	const limit =
		resource === "inventory"
			? limits.maxInventoryItems
			: resource === "meals"
				? limits.maxMeals
				: limits.maxGroceryLists;

	if (limit === -1) {
		return {
			allowed: true,
			current: 0,
			limit: -1,
			tier,
			isExpired,
			canAdd: Number.POSITIVE_INFINITY,
		};
	}

	const current = await getResourceCount(env, organizationId, resource);
	const canAdd = Math.max(0, limit - current);
	const allowed = current + Math.max(0, addCount) <= limit;

	return { allowed, current, limit, tier, isExpired, canAdd };
}

export async function checkCapacity(
	env: Env,
	organizationId: string,
	resource: CapacityResource,
	addCount = 1,
) {
	const tierInfo = await getGroupTierLimits(env, organizationId);
	return checkCapacityWithTier(
		env,
		organizationId,
		resource,
		tierInfo,
		addCount,
	);
}

export async function checkOwnedGroupCapacity(env: Env, userId: string) {
	const db = drizzle(env.DB, { schema });

	const user = await db.query.user.findFirst({
		where: eq(schema.user.id, userId),
		columns: { tier: true, tierExpiresAt: true },
	});

	const rawTier: TierSlug =
		user?.tier === "crew_member" ? "crew_member" : "free";
	const { tier } = getEffectiveTier(rawTier, user?.tierExpiresAt ?? null);
	const limit = TIER_LIMITS[tier].maxOwnedGroups;

	const [result] = await db
		.select({ count: sql<number>`count(*)` })
		.from(schema.member)
		.where(
			and(eq(schema.member.userId, userId), eq(schema.member.role, "owner")),
		);

	const current = result?.count ?? 0;

	return {
		tier,
		limit,
		current,
		allowed: current < limit,
		canCreate: Math.max(0, limit - current),
	};
}
