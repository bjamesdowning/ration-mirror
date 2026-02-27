import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { toExpiryDate } from "~/lib/date-utils";
import {
	TIER_LIMITS,
	type TierLimits,
	type TierSlug,
} from "~/lib/tiers.server";

type CapacityResource = "cargo" | "meals" | "supplyLists";

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
	tierExpiresAt: Date | number | string | null | undefined,
	now = new Date(),
): { tier: TierSlug; isExpired: boolean } {
	const expiresAt = toExpiryDate(tierExpiresAt);
	if (
		tier === "crew_member" &&
		expiresAt &&
		expiresAt.getTime() <= now.getTime()
	) {
		return { tier: "free", isExpired: true };
	}

	return { tier, isExpired: false };
}

const TIER_CACHE_TTL_SECONDS = 60;
const tierCacheKey = (organizationId: string) => `tier:${organizationId}`;

type CachedTierPayload = {
	tier: TierSlug;
	isExpired: boolean;
	cachedAt: number;
};

/**
 * Invalidate the tier cache for a given organization.
 * Call this after any operation that changes the owner's tier (e.g. Stripe webhook).
 */
export async function invalidateTierCache(
	env: Env,
	organizationId: string,
): Promise<void> {
	try {
		await env.RATION_KV.delete(tierCacheKey(organizationId));
	} catch {
		// Non-fatal: cache invalidation failure just means stale data for up to TTL
	}
}

/**
 * Get tier limits for a group (organization). Tier is derived from the
 * **organization owner's** user.tier, not the current viewer.
 *
 * Owner-based (group-level): Use for capacity checks (inventory, meals, lists),
 * feature gates (sharing, invites), and UI that shows group limits.
 * Consumers: dashboard layout, API routes (inventory.batch, meals, grocery share).
 *
 * User-based: Use user.tier directly for "Your Plan" and other personal displays.
 * Consumers: settings loader (Your Plan section), pricing page (user tier badge).
 *
 * When purchaser ≠ owner (e.g. admin buys for group), only purchaser's user.tier
 * is updated; group limits stay based on owner's tier until owner upgrades.
 *
 * Tier data is cached in KV for 60s to eliminate 2 D1 reads per request for
 * active users. Group switches are safe: a new groupId produces a new cache key,
 * so the cache miss fetches fresh data. On tier change (Stripe webhook), call
 * invalidateTierCache() to ensure the new tier is visible immediately.
 */
export async function getGroupTierLimits(
	env: Env,
	organizationId: string,
): Promise<{ tier: TierSlug; limits: TierLimits; isExpired: boolean }> {
	// Check KV cache first
	try {
		const cached = await env.RATION_KV.get(tierCacheKey(organizationId), {
			type: "json",
			cacheTtl: TIER_CACHE_TTL_SECONDS,
		});
		if (cached) {
			const payload = cached as CachedTierPayload;
			const tier = payload.tier ?? "free";
			return { tier, limits: TIER_LIMITS[tier], isExpired: payload.isExpired };
		}
	} catch {
		// Cache miss or error — fall through to D1
	}

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

	// Write result to KV cache
	try {
		const payload: CachedTierPayload = {
			tier,
			isExpired,
			cachedAt: Date.now(),
		};
		await env.RATION_KV.put(
			tierCacheKey(organizationId),
			JSON.stringify(payload),
			{ expirationTtl: TIER_CACHE_TTL_SECONDS },
		);
	} catch {
		// Non-fatal: operating without cache is acceptable
	}

	return { tier, limits: TIER_LIMITS[tier], isExpired };
}

async function getResourceCount(
	env: Env,
	organizationId: string,
	resource: CapacityResource,
) {
	const db = drizzle(env.DB, { schema });

	if (resource === "cargo") {
		const [result] = await db
			.select({ count: sql<number>`count(*)` })
			.from(schema.cargo)
			.where(eq(schema.cargo.organizationId, organizationId));
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
		.from(schema.supplyList)
		.where(eq(schema.supplyList.organizationId, organizationId));
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
		resource === "cargo"
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

/**
 * Check how many groups the current user can own. Uses **user-based** tier
 * (the given userId's user.tier), not the group owner's tier.
 */
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
