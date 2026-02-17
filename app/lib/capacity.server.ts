import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { log } from "~/lib/logging.server";
import {
	TIER_LIMITS,
	type TierLimits,
	type TierSlug,
} from "~/lib/tiers.server";

const TIER_CACHE_TTL_SECONDS = 60;

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

function getTierCacheKey(organizationId: string) {
	return `tier:${organizationId}`;
}

type CachedTier = {
	tier: TierSlug;
	tierExpiresAt: number | null;
};

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

export async function invalidateGroupTierCache(
	kv: KVNamespace,
	organizationId: string,
) {
	await kv.delete(getTierCacheKey(organizationId));
}

export async function getGroupTierLimits(
	env: Env,
	organizationId: string,
): Promise<{ tier: TierSlug; limits: TierLimits; isExpired: boolean }> {
	const cacheKey = getTierCacheKey(organizationId);
	const cached = await env.RATION_KV.get<CachedTier>(cacheKey, "json");
	const now = new Date();

	if (cached) {
		const { tier, isExpired } = getEffectiveTier(
			cached.tier,
			cached.tierExpiresAt ? new Date(cached.tierExpiresAt * 1000) : null,
			now,
		);
		return { tier, limits: TIER_LIMITS[tier], isExpired };
	}

	const db = drizzle(env.DB, { schema });

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

	// #region agent log
	try {
		await env.RATION_KV.put(
			cacheKey,
			JSON.stringify({
				tier: rawTier,
				tierExpiresAt: tierExpiresAt
					? Math.floor(tierExpiresAt.getTime() / 1000)
					: null,
			}),
			{
				expirationTtl: TIER_CACHE_TTL_SECONDS,
			},
		);
	} catch (kvErr) {
		const msg = kvErr instanceof Error ? kvErr.message : String(kvErr);
		fetch("http://127.0.0.1:7242/ingest/0202d342-7d1c-4e4e-92f6-bbd90f6d215c", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				location: "capacity.server.ts:getGroupTierLimits",
				message: "KV PUT failed (degrading without cache)",
				data: {
					organizationId,
					rawTier,
					errorMessage: msg,
					hypothesisId: "H1",
				},
				timestamp: Date.now(),
			}),
		}).catch(() => {});
		log.warn("Tier cache PUT failed (returning tier without cache)", {
			organizationId,
			errorMessage: msg,
		});
		// Degrade gracefully: return correct tier from DB without caching (avoids 500 on KV 429)
	}
	// #endregion

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

export async function checkCapacity(
	env: Env,
	organizationId: string,
	resource: CapacityResource,
	addCount = 1,
) {
	const { tier, limits, isExpired } = await getGroupTierLimits(
		env,
		organizationId,
	);
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
