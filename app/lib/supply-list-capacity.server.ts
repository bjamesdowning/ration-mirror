import { and, asc, eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { supplyList } from "~/db/schema";
import { getGroupTierLimits } from "./capacity.server";
import { isUniqueConstraintError } from "./supply-list-kinds";

export async function listUsedQuotaSlots(
	db: D1Database,
	organizationId: string,
): Promise<Set<number>> {
	const d1 = drizzle(db);
	const rows = await d1
		.select({ quotaSlot: supplyList.quotaSlot })
		.from(supplyList)
		.where(
			and(
				eq(supplyList.organizationId, organizationId),
				isNotNull(supplyList.quotaSlot),
			),
		);
	const used = new Set<number>();
	for (const row of rows) {
		if (typeof row.quotaSlot === "number") used.add(row.quotaSlot);
	}
	return used;
}

export function nextQuotaSlot(used: Set<number>, limit: number): number | null {
	if (limit < 1) return null;
	for (let slot = 1; slot <= limit; slot++) {
		if (!used.has(slot)) return slot;
	}
	return null;
}

export async function allocateSupplyQuotaSlot(
	env: Env,
	organizationId: string,
): Promise<{ slot: number; current: number; limit: number }> {
	const tierInfo = await getGroupTierLimits(env, organizationId);
	const limit = tierInfo.limits.maxGroceryLists;
	const used = await listUsedQuotaSlots(env.DB, organizationId);
	const current = used.size;
	if (limit !== -1 && current >= limit) {
		throw new Error(`capacity_exceeded:supplyLists:${current}:${limit}`);
	}
	const slot = nextQuotaSlot(
		used,
		limit === -1 ? Math.max(current + 1, 1) : limit,
	);
	if (slot == null) {
		throw new Error(`capacity_exceeded:supplyLists:${current}:${limit}`);
	}
	return { slot, current, limit };
}

export async function insertSupplyListWithQuota(options: {
	env: Env;
	organizationId: string;
	values: {
		id: string;
		name: string;
		kind: "live" | "saved" | "template";
		createdFrom: string;
		sourceListId?: string | null;
		sourceReference?: string | null;
		storeProfileId?: string | null;
		quotaSlot?: number;
		revision?: number;
	};
}): Promise<{ id: string; quotaSlot: number }> {
	const d1 = drizzle(options.env.DB);
	for (let attempt = 0; attempt < 8; attempt++) {
		const allocation =
			options.values.quotaSlot != null
				? {
						slot: options.values.quotaSlot,
						current: 0,
						limit: options.values.quotaSlot,
					}
				: await allocateSupplyQuotaSlot(options.env, options.organizationId);
		try {
			await d1.insert(supplyList).values({
				id: options.values.id,
				organizationId: options.organizationId,
				name: options.values.name,
				kind: options.values.kind,
				createdFrom: options.values.createdFrom,
				sourceListId: options.values.sourceListId ?? null,
				sourceReference: options.values.sourceReference ?? null,
				storeProfileId: options.values.storeProfileId ?? null,
				quotaSlot: allocation.slot,
				revision: options.values.revision ?? 0,
			});
			return { id: options.values.id, quotaSlot: allocation.slot };
		} catch (error) {
			if (!isUniqueConstraintError(error)) throw error;
			if (options.values.quotaSlot != null) throw error;
		}
	}
	const used = await listUsedQuotaSlots(options.env.DB, options.organizationId);
	const tierInfo = await getGroupTierLimits(
		options.env,
		options.organizationId,
	);
	throw new Error(
		`capacity_exceeded:supplyLists:${used.size}:${tierInfo.limits.maxGroceryLists}`,
	);
}

export async function assignMissingQuotaSlots(
	db: D1Database,
	organizationId: string,
	liveId: string,
): Promise<void> {
	const d1 = drizzle(db);
	const rows = await d1
		.select({
			id: supplyList.id,
			quotaSlot: supplyList.quotaSlot,
			updatedAt: supplyList.updatedAt,
		})
		.from(supplyList)
		.where(eq(supplyList.organizationId, organizationId))
		.orderBy(asc(supplyList.updatedAt), asc(supplyList.id));

	const used = new Set<number>();
	for (const row of rows) {
		if (row.id === liveId) used.add(1);
		else if (typeof row.quotaSlot === "number") used.add(row.quotaSlot);
	}

	await d1
		.update(supplyList)
		.set({ quotaSlot: 1, updatedAt: new Date() })
		.where(eq(supplyList.id, liveId));

	let next = 2;
	for (const row of rows) {
		if (row.id === liveId) continue;
		if (typeof row.quotaSlot === "number") continue;
		while (used.has(next)) next += 1;
		used.add(next);
		await d1
			.update(supplyList)
			.set({ quotaSlot: next, updatedAt: new Date() })
			.where(eq(supplyList.id, row.id));
		next += 1;
	}
}
