import {
	and,
	asc,
	desc,
	eq,
	gt,
	gte,
	inArray,
	isNotNull,
	lt,
	lte,
	or,
	sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { cargo, cargoTag, ledger, type supplyItem } from "../db/schema";
import { CapacityExceededError, checkCapacity } from "./capacity.server";
import { type CargoIndexRow, fetchOrgCargoIndex } from "./cargo-index.server";
import type { ParsedCsvItem } from "./csv-parser";
import { ITEM_DOMAINS } from "./domain";
import { log } from "./logging.server";
import { normalizeForCargoDedup } from "./matching";
import {
	areIngredientUnitsCompatible,
	convertForIngredient,
} from "./present-quantity";
import {
	chunkArray,
	chunkedQuery,
	D1_MAX_BOUND_PARAMS,
	D1_MAX_TAG_ROWS_PER_STATEMENT,
} from "./query-utils.server";
import { TagSlugsInputSchema } from "./schemas/tag";
import { UnitSchema } from "./schemas/units";
import { trackD1BatchSize, trackWriteOperation } from "./telemetry.server";
import {
	getUnitMultiplier,
	normalizeUnitAlias,
	type SupportedUnit,
	toSupportedUnit,
} from "./units";
import {
	deleteCargoVectors,
	findSimilarCargoBatch,
	SIMILARITY_THRESHOLDS,
	upsertCargoVector,
	upsertCargoVectors,
} from "./vector.server";

export {
	calculateInventoryStatus,
	normalizeForCargoKey,
} from "./cargo-utils";

export {
	getCargoTagIndex,
	getOrganizationTagSlugs as getCargoTags,
	getTagsForCargoIds,
	setCargoTags,
} from "./tags.server";

import { computeBaseFields } from "./base-quantity";
import {
	calculateInventoryStatus,
	getExpiredCargoBounds,
	getExpiringCargoBounds,
	normalizeForCargoKey,
	parseUtcDateISO,
} from "./cargo-utils";
import { normalizeCargoQuantity } from "./format-quantity";
import { dedupeTagSlugs, type TagRecord, uniqueTagSlugs } from "./tags";
import { getTagsForCargoIds, resolveTagIds, setCargoTags } from "./tags.server";

const CargoItemBaseSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.transform((v) => v.toLowerCase()),
	quantity: z.coerce.number().min(0, "Quantity must be positive"), // coerce handles string->number from forms
	unit: UnitSchema,
	domain: z.enum(ITEM_DOMAINS).default("food"),
	tags: TagSlugsInputSchema,
	expiresAt: z.coerce.date().optional(),
});

export const CargoItemSchema = CargoItemBaseSchema.transform((data) => ({
	...data,
	quantity: normalizeCargoQuantity(data.quantity, data.unit),
	tags: dedupeTagSlugs(data.tags),
}));

export const PartialCargoItemSchema = CargoItemBaseSchema.partial();

export type CargoItemInput = z.infer<typeof CargoItemSchema>;
export type CargoItemUpdateInput = Partial<CargoItemInput>;

/**
 * Fetch inventory items for a specific organization.
 * Ordered by creation date descending (newest first).
 *
 * Pagination: pass `limit` and `offset` for page/cursor-based loading.
 * Omit both to fetch all rows (needed by exports, scan dedup, and supply matching).
 */
export async function getCargo(
	db: D1Database,
	organizationId: string,
	domain?: (typeof ITEM_DOMAINS)[number],
	options?: { limit?: number; offset?: number },
) {
	const d1 = drizzle(db);
	const conditions = [eq(cargo.organizationId, organizationId)];

	if (domain) {
		conditions.push(eq(cargo.domain, domain));
	}

	let query = d1
		.select()
		.from(cargo)
		.where(and(...conditions))
		.orderBy(desc(cargo.createdAt))
		.$dynamic();

	if (options?.limit !== undefined) {
		query = query.limit(options.limit);
	}
	if (options?.offset !== undefined) {
		query = query.offset(options.offset);
	}

	return await query;
}

export type CargoPageSortBy = "createdAt" | "expiresAt";

export type CargoPageCursor =
	| { sortBy: "createdAt"; createdAt: Date; id: string }
	| { sortBy: "expiresAt"; expiresAt: Date; id: string };

/**
 * Cursor-paginated cargo fetch.
 *
 * Default order: `(createdAt desc, id asc)`.
 * With `sortBy: "expiresAt"`: `(expiresAt asc, id asc)` — items without expiry are omitted.
 */
export async function getCargoPage(
	db: D1Database,
	organizationId: string,
	options: {
		limit: number;
		cursor?: CargoPageCursor | null;
		domain?: (typeof ITEM_DOMAINS)[number];
		expiresBefore?: string;
		expiresAfter?: string;
		sortBy?: CargoPageSortBy;
	},
) {
	const d1 = drizzle(db);
	const sortBy = options.sortBy ?? "createdAt";
	const conditions = [eq(cargo.organizationId, organizationId)];
	if (options.domain) {
		conditions.push(eq(cargo.domain, options.domain));
	}
	if (options.expiresBefore) {
		conditions.push(
			isNotNull(cargo.expiresAt),
			lte(cargo.expiresAt, parseUtcDateISO(options.expiresBefore)),
		);
	}
	if (options.expiresAfter) {
		conditions.push(
			isNotNull(cargo.expiresAt),
			gte(cargo.expiresAt, parseUtcDateISO(options.expiresAfter)),
		);
	}

	if (sortBy === "expiresAt") {
		conditions.push(isNotNull(cargo.expiresAt));
		const cursor = options.cursor;
		if (cursor?.sortBy === "expiresAt") {
			const cursorClause = or(
				gt(cargo.expiresAt, cursor.expiresAt),
				and(eq(cargo.expiresAt, cursor.expiresAt), gt(cargo.id, cursor.id)),
			);
			if (cursorClause) conditions.push(cursorClause);
		} else if (cursor?.sortBy === "createdAt") {
			// Mismatched cursor/sort — ignore cursor and start fresh
		}

		const rows = await d1
			.select()
			.from(cargo)
			.where(and(...conditions))
			.orderBy(asc(cargo.expiresAt), asc(cargo.id))
			.limit(options.limit + 1);

		const hasMore = rows.length > options.limit;
		const items = hasMore ? rows.slice(0, options.limit) : rows;
		const last = items[items.length - 1];
		const nextCursor =
			hasMore && last?.expiresAt
				? ({
						sortBy: "expiresAt" as const,
						expiresAt: last.expiresAt,
						id: last.id,
					} satisfies CargoPageCursor)
				: null;
		return { items, nextCursor };
	}

	if (options.cursor?.sortBy === "createdAt") {
		const cursorClause = or(
			lt(cargo.createdAt, options.cursor.createdAt),
			and(
				eq(cargo.createdAt, options.cursor.createdAt),
				gt(cargo.id, options.cursor.id),
			),
		);
		if (cursorClause) conditions.push(cursorClause);
	}

	const rows = await d1
		.select()
		.from(cargo)
		.where(and(...conditions))
		.orderBy(desc(cargo.createdAt), asc(cargo.id))
		.limit(options.limit + 1);

	const hasMore = rows.length > options.limit;
	const items = hasMore ? rows.slice(0, options.limit) : rows;
	const last = items[items.length - 1];
	const nextCursor =
		hasMore && last
			? ({
					sortBy: "createdAt" as const,
					createdAt: last.createdAt,
					id: last.id,
				} satisfies CargoPageCursor)
			: null;
	return { items, nextCursor };
}

/**
 * Count inventory items for an organization, optionally filtered by domain.
 * Used for pagination total.
 */
export async function getCargoCount(
	db: D1Database,
	organizationId: string,
	domain?: (typeof ITEM_DOMAINS)[number],
): Promise<number> {
	const d1 = drizzle(db);
	const conditions = [eq(cargo.organizationId, organizationId)];
	if (domain) {
		conditions.push(eq(cargo.domain, domain));
	}
	const [row] = await d1
		.select({ count: sql<number>`count(*)` })
		.from(cargo)
		.where(and(...conditions));
	return Number(row?.count ?? 0);
}

/**
 * Fetch a single cargo item by ID, scoped to the organization.
 */
export async function getCargoItem(
	db: D1Database,
	organizationId: string,
	cargoId: string,
) {
	const d1 = drizzle(db);
	const [item] = await d1
		.select()
		.from(cargo)
		.where(and(eq(cargo.organizationId, organizationId), eq(cargo.id, cargoId)))
		.limit(1);

	return item ?? null;
}

/**
 * Returns the IDs of the previous and next cargo items in the org-scoped list
 * (ordered by createdAt desc, id asc for tie-breaker).
 * Uses cursor-based queries; no pagination needed.
 */
export async function getAdjacentCargoIds(
	db: D1Database,
	organizationId: string,
	current: { id: string; createdAt: Date },
	filters: { domain?: string },
): Promise<{ prevId: string | null; nextId: string | null }> {
	const d1 = drizzle(db);
	const baseConditions = [eq(cargo.organizationId, organizationId)];
	if (
		filters.domain &&
		ITEM_DOMAINS.includes(filters.domain as (typeof ITEM_DOMAINS)[number])
	) {
		baseConditions.push(eq(cargo.domain, filters.domain));
	}
	const baseWhere = and(...baseConditions);

	// Prev: item with (createdAt > current) OR (createdAt = current AND id < current) — newer in DESC list
	const prevQuery = d1
		.select({ id: cargo.id })
		.from(cargo)
		.where(
			and(
				baseWhere,
				or(
					gt(cargo.createdAt, current.createdAt),
					and(eq(cargo.createdAt, current.createdAt), lt(cargo.id, current.id)),
				),
			),
		)
		.orderBy(asc(cargo.createdAt), desc(cargo.id))
		.limit(1);

	// Next: item with (createdAt < current) OR (createdAt = current AND id > current) — older in DESC list
	const nextQuery = d1
		.select({ id: cargo.id })
		.from(cargo)
		.where(
			and(
				baseWhere,
				or(
					lt(cargo.createdAt, current.createdAt),
					and(eq(cargo.createdAt, current.createdAt), gt(cargo.id, current.id)),
				),
			),
		)
		.orderBy(desc(cargo.createdAt), asc(cargo.id))
		.limit(1);

	const [prevResult, nextResult] = await d1.batch([prevQuery, nextQuery]);
	return {
		prevId: prevResult[0]?.id ?? null,
		nextId: nextResult[0]?.id ?? null,
	};
}

/**
 * Fetch a specific set of cargo rows by their IDs, scoped to the organization.
 * Used by MCP search to resolve Vectorize matches without a full-table scan.
 * Uses chunkedQuery to stay under D1's 100 bound-parameter limit.
 */
export async function getCargoByIds(
	db: D1Database,
	organizationId: string,
	ids: string[],
) {
	if (ids.length === 0) return [];
	const d1 = drizzle(db);
	// orgId = 1 param; inArray adds N. Use chunkSize 99 to stay under 100.
	return chunkedQuery(
		ids,
		(chunk) =>
			d1
				.select()
				.from(cargo)
				.where(
					and(
						eq(cargo.organizationId, organizationId),
						inArray(cargo.id, chunk),
					),
				)
				.limit(chunk.length),
		99,
	);
}

/** Attach junction-table tags to cargo rows by id. */
export async function attachTagsToCargo<T extends { id: string }>(
	db: D1Database,
	items: T[],
): Promise<(T & { tags: TagRecord[] })[]> {
	if (items.length === 0) return [];
	const tagMap = await getTagsForCargoIds(
		db,
		items.map((item) => item.id),
	);
	return items.map((item) => ({
		...item,
		tags: tagMap.get(item.id) ?? [],
	}));
}

/** getCargo with tags from the centralized tag registry. */
export async function getCargoWithTags(
	db: D1Database,
	organizationId: string,
	domain?: (typeof ITEM_DOMAINS)[number],
	options?: { limit?: number; offset?: number },
) {
	const items = await getCargo(db, organizationId, domain, options);
	return attachTagsToCargo(db, items);
}

type MergeCandidate = {
	id: string;
	name: string;
	quantity: number;
	unit: SupportedUnit;
	score: number;
	convertedQuantity: number;
};

export type AddOrMergeItemResult =
	| {
			status: "created";
			item: typeof cargo.$inferSelect;
	  }
	| {
			status: "merged";
			item: typeof cargo.$inferSelect;
	  }
	| {
			status: "merge_candidate";
			candidate: MergeCandidate;
	  }
	| {
			status: "invalid_merge_target";
	  };

export interface AddOrMergeItemOptions {
	forceCreateNew?: boolean;
	allowFuzzyCandidate?: boolean;
	mergeTargetId?: string;
	/** ctx.waitUntil from the Worker execution context — ensures vector upserts survive response completion */
	waitUntil?: (promise: Promise<unknown>) => void;
}

function isCompatibleUnit(
	a: string,
	b: string,
	ingredientName?: string,
): boolean {
	if (getUnitMultiplier(a as SupportedUnit, b as SupportedUnit) !== null) {
		return true;
	}
	if (!ingredientName) return false;
	return areIngredientUnitsCompatible(a, b, ingredientName);
}

function convertForMerge(
	quantity: number,
	from: SupportedUnit,
	to: SupportedUnit,
	ingredientName: string,
): number | null {
	const direct = convertForIngredient(quantity, from, to, ingredientName);
	return direct;
}

export interface IngestItem {
	name: string;
	quantity: number;
	unit: SupportedUnit;
	domain: (typeof ITEM_DOMAINS)[number];
	tags: string[];
	expiresAt?: Date;
	mergeTargetId?: string;
}

export interface IngestItemResult {
	status:
		| "merged"
		| "created"
		| "capacity_exceeded"
		| "merge_candidate"
		| "invalid_merge_target"
		| "error";
	item?: typeof cargo.$inferSelect;
	mergedInto?: { id: string; name: string };
	mergeCandidate?: MergeCandidate;
	error?: string;
}

export interface IngestCargoOptions {
	skipVectorPhase?: boolean;
	/** When true, vector matches return merge_candidate instead of auto-merging (for manual add UI) */
	returnMergeCandidateOnFuzzy?: boolean;
	/** ctx.waitUntil from the Worker execution context — ensures vector upserts survive response completion */
	waitUntil?: (promise: Promise<unknown>) => void;
	/** When true, invalid mergeTargetId returns error. When false, fall through to exact/vector/create (batch) */
	strictMergeTarget?: boolean;
	/** When true, always create new rows (skip all merge resolution) */
	forceCreateNew?: boolean;
}

/**
 * Central ingestion: resolve duplicates (string + vector), then merge or create.
 * All cargo entry points (manual add, scan batch, CSV import, supply dock) route here.
 */
export async function ingestCargoItems(
	env: Env,
	organizationId: string,
	items: IngestItem[],
	options?: IngestCargoOptions,
): Promise<IngestItemResult[]> {
	if (items.length === 0) return [];

	const d1 = drizzle(env.DB);
	const existingCargo = await fetchOrgCargoIndex(env.DB, organizationId);

	const cargoById = new Map<string, CargoIndexRow>();
	const cargoByKey = new Map<string, CargoIndexRow[]>();
	for (const c of existingCargo) {
		cargoById.set(c.id, c);
		const key = `${normalizeForCargoKey(c.name)}__${c.domain}`;
		const arr = cargoByKey.get(key) ?? [];
		arr.push(c);
		cargoByKey.set(key, arr);
	}

	const quantityByCargoId = new Map<string, number>();
	for (const c of existingCargo) {
		quantityByCargoId.set(c.id, c.quantity);
	}

	type Resolved =
		| { action: "merge"; targetId: string; convertedQty: number }
		| { action: "merge_candidate"; candidate: MergeCandidate }
		| { action: "invalid_merge_target" }
		| { action: "create" };

	const resolved: (Resolved | undefined)[] = new Array(items.length);
	const toVectorResolve: number[] = [];

	for (let i = 0; i < items.length; i++) {
		const it = items[i];
		if (options?.forceCreateNew) {
			resolved[i] = { action: "create" };
			continue;
		}
		const unit = it.unit as SupportedUnit;
		const key = `${normalizeForCargoKey(it.name)}__${it.domain}`;

		if (it.mergeTargetId) {
			const target = cargoById.get(it.mergeTargetId);
			if (
				target &&
				target.domain === it.domain &&
				isCompatibleUnit(target.unit, it.unit, it.name)
			) {
				const converted = convertForMerge(
					it.quantity,
					unit,
					target.unit as SupportedUnit,
					it.name,
				);
				if (converted !== null) {
					resolved[i] = {
						action: "merge",
						targetId: target.id,
						convertedQty: converted,
					};
					const cur = quantityByCargoId.get(target.id) ?? target.quantity;
					quantityByCargoId.set(
						target.id,
						normalizeCargoQuantity(
							cur + converted,
							target.unit as SupportedUnit,
						),
					);
					continue;
				}
			}
			if (options?.strictMergeTarget) {
				resolved[i] = { action: "invalid_merge_target" };
				continue;
			}
		}

		const exactBucket = cargoByKey.get(key) ?? [];
		const exact = exactBucket.find((c) =>
			isCompatibleUnit(c.unit, it.unit, it.name),
		);
		if (exact) {
			const converted = convertForMerge(
				it.quantity,
				unit,
				exact.unit as SupportedUnit,
				it.name,
			);
			if (converted !== null) {
				resolved[i] = {
					action: "merge",
					targetId: exact.id,
					convertedQty: converted,
				};
				const cur = quantityByCargoId.get(exact.id) ?? exact.quantity;
				quantityByCargoId.set(
					exact.id,
					normalizeCargoQuantity(cur + converted, exact.unit as SupportedUnit),
				);
				continue;
			}
		}

		if (options?.skipVectorPhase) {
			resolved[i] = { action: "create" };
			continue;
		}
		toVectorResolve.push(i);
	}

	if (toVectorResolve.length > 0 && env.VECTORIZE && env.AI) {
		const uniqueNames = [...new Set(toVectorResolve.map((i) => items[i].name))];
		const similarityMap = await findSimilarCargoBatch(
			env,
			organizationId,
			uniqueNames,
			{
				topK: 1,
				threshold: SIMILARITY_THRESHOLDS.CARGO_MERGE,
			},
		);

		for (const idx of toVectorResolve) {
			const it = items[idx];
			const similar = similarityMap.get(it.name);
			const best = similar?.[0];
			let handled = false;
			if (best) {
				const target = cargoById.get(best.itemId);
				if (
					target &&
					target.domain === it.domain &&
					isCompatibleUnit(target.unit, it.unit, it.name)
				) {
					const converted = convertForMerge(
						it.quantity,
						it.unit as SupportedUnit,
						target.unit as SupportedUnit,
						it.name,
					);
					if (converted !== null) {
						if (options?.returnMergeCandidateOnFuzzy) {
							resolved[idx] = {
								action: "merge_candidate",
								candidate: {
									id: target.id,
									name: target.name,
									quantity: target.quantity,
									unit: target.unit as SupportedUnit,
									score: best.score,
									convertedQuantity: converted,
								},
							};
						} else {
							resolved[idx] = {
								action: "merge",
								targetId: target.id,
								convertedQty: converted,
							};
							const cur = quantityByCargoId.get(target.id) ?? target.quantity;
							quantityByCargoId.set(
								target.id,
								normalizeCargoQuantity(
									cur + converted,
									target.unit as SupportedUnit,
								),
							);
						}
						handled = true;
					}
				}
			}
			if (!handled) {
				resolved[idx] = { action: "create" };
			}
		}
	} else {
		for (const idx of toVectorResolve) {
			resolved[idx] = { action: "create" };
		}
	}

	const mergeCandidateResult = resolved.find(
		(r) => r?.action === "merge_candidate",
	);
	if (
		mergeCandidateResult &&
		mergeCandidateResult.action === "merge_candidate"
	) {
		return [
			{
				status: "merge_candidate" as const,
				mergeCandidate: mergeCandidateResult.candidate,
			},
		];
	}
	const invalidMergeResult = resolved.find(
		(r) => r?.action === "invalid_merge_target",
	);
	if (invalidMergeResult) {
		return [{ status: "invalid_merge_target" as const }];
	}

	const createCount = resolved.filter((r) => r?.action === "create").length;
	const capacity = await checkCapacity(
		env,
		organizationId,
		"cargo",
		createCount,
	);
	if (!capacity.allowed) {
		return items.map(() => ({
			status: "capacity_exceeded" as const,
			error: "capacity_exceeded",
		}));
	}

	const now = new Date();
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch requires tuple, we build dynamically
	const batchOps: any[] = [];
	const newCargoForVector: Array<{ id: string; name: string; domain: string }> =
		[];
	const results: IngestItemResult[] = [];
	const mergedTargetIds = new Set<string>();
	const pendingTagSets: Array<{
		resultIndex: number;
		cargoId: string;
		slugs: string[];
	}> = [];

	for (let i = 0; i < items.length; i++) {
		const it = items[i];
		const r = resolved[i] ?? { action: "create" as const };
		if (r.action === "merge") {
			const target = cargoById.get(r.targetId);
			const newQty = quantityByCargoId.get(r.targetId);
			if (!target || newQty === undefined) continue;
			if (!mergedTargetIds.has(r.targetId)) {
				mergedTargetIds.add(r.targetId);
				const mergedBase = computeBaseFields(newQty, target.unit, target.name);
				batchOps.push(
					d1
						.update(cargo)
						.set({
							quantity: newQty,
							baseQuantity: mergedBase.baseQuantity,
							baseUnit: mergedBase.baseUnit,
							updatedAt: now,
						})
						.where(
							and(
								eq(cargo.id, r.targetId),
								eq(cargo.organizationId, organizationId),
							),
						),
				);
			}
			results.push({
				status: "merged",
				item: {
					...target,
					quantity: newQty,
					updatedAt: now,
				} as typeof cargo.$inferSelect,
				mergedInto: { id: target.id, name: target.name },
			});
			continue;
		}

		const newId = crypto.randomUUID();
		const normalizedQty = normalizeCargoQuantity(it.quantity, it.unit);
		const base = computeBaseFields(normalizedQty, it.unit, it.name);
		const tagSlugs = dedupeTagSlugs(it.tags);
		batchOps.push(
			d1.insert(cargo).values({
				id: newId,
				organizationId,
				name: it.name,
				quantity: normalizedQty,
				unit: it.unit,
				baseQuantity: base.baseQuantity,
				baseUnit: base.baseUnit,
				domain: it.domain,
				status: calculateInventoryStatus(it.expiresAt),
				expiresAt: it.expiresAt ?? null,
				createdAt: now,
				updatedAt: now,
			}),
		);
		const newRow = {
			id: newId,
			organizationId,
			name: it.name,
			quantity: normalizedQty,
			unit: it.unit,
			domain: it.domain,
			status: calculateInventoryStatus(it.expiresAt),
			expiresAt: it.expiresAt ?? null,
			createdAt: now,
			updatedAt: now,
		} as typeof cargo.$inferSelect;
		cargoById.set(newId, newRow);
		quantityByCargoId.set(newId, normalizedQty);
		const key = `${normalizeForCargoKey(it.name)}__${it.domain}`;
		const arr = cargoByKey.get(key) ?? [];
		arr.push(newRow);
		cargoByKey.set(key, arr);
		newCargoForVector.push({
			id: newId,
			name: it.name,
			domain: it.domain ?? "food",
		});
		results.push({ status: "created", item: newRow });
		pendingTagSets.push({
			resultIndex: results.length - 1,
			cargoId: newId,
			slugs: tagSlugs,
		});
	}

	if (batchOps.length > 0) {
		trackD1BatchSize("ingestCargoItems", batchOps.length, {
			organizationRef: organizationId,
		});
		await trackWriteOperation(
			"ingestCargoItems",
			async () => {
				for (const opChunk of chunkArray(batchOps, D1_MAX_BOUND_PARAMS)) {
					// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
					await d1.batch(opChunk as [any, ...any[]]);
				}
			},
			{
				organizationRef: organizationId,
			},
		);
	}

	if (pendingTagSets.length > 0) {
		// Per-row cap via dedupeTagSlugs; then uncapped union across the batch.
		const allSlugs = uniqueTagSlugs(
			pendingTagSets.flatMap((p) => dedupeTagSlugs(p.slugs)),
		);
		const tagIdsBySlug = new Map<string, string>();
		if (allSlugs.length > 0) {
			const resolvedTagIds = await resolveTagIds(
				env.DB,
				organizationId,
				allSlugs,
			);
			for (let i = 0; i < allSlugs.length; i++) {
				tagIdsBySlug.set(allSlugs[i], resolvedTagIds[i]);
			}
		}
		const tagUpdates = pendingTagSets.map(({ cargoId, slugs }) => ({
			cargoId,
			tagIds: dedupeTagSlugs(slugs)
				.map((slug) => tagIdsBySlug.get(slug))
				.filter((id): id is string => typeof id === "string"),
		}));
		await applyCargoTagsForImportBatch(env.DB, tagUpdates);

		const tagsByCargoId = await getTagsForCargoIds(
			env.DB,
			pendingTagSets.map((p) => p.cargoId),
		);
		for (const { resultIndex, cargoId } of pendingTagSets) {
			const result = results[resultIndex];
			if (result?.item) {
				result.item = {
					...result.item,
					tags: tagsByCargoId.get(cargoId) ?? [],
				} as typeof cargo.$inferSelect;
			}
		}
	}

	if (newCargoForVector.length > 0) {
		const upsertPromise = upsertCargoVectors(
			env,
			organizationId,
			newCargoForVector,
		).catch((err) => {
			log.error("[Vector] batch upsert failed for ingest:", err);
		});
		if (options?.waitUntil) {
			options.waitUntil(upsertPromise);
		} else if (options?.skipVectorPhase) {
			// Import/MCP paths skip fuzzy-merge AI but still need embeddings for
			// later semantic search. No waitUntil on those callers — await here.
			await upsertPromise;
		}
	}

	return results;
}

/**
 * Add a new item to the organization's inventory.
 * Supports merge-on-add to prevent duplicate inventory rows.
 * Thin wrapper around ingestCargoItems.
 */
export async function addOrMergeItem(
	env: Env,
	organizationId: string,
	data: CargoItemInput,
	options: AddOrMergeItemOptions = {},
) {
	const [result] = await ingestCargoItems(
		env,
		organizationId,
		[
			{
				name: data.name,
				quantity: data.quantity,
				unit: data.unit,
				domain: data.domain,
				tags: data.tags,
				expiresAt: data.expiresAt,
				mergeTargetId: options.mergeTargetId,
			},
		],
		{
			forceCreateNew: options.forceCreateNew,
			returnMergeCandidateOnFuzzy: options.allowFuzzyCandidate,
			strictMergeTarget: true,
			waitUntil: options.waitUntil,
		},
	);

	if (!result) {
		throw new Error("ingestCargoItems returned no result");
	}

	if (result.status === "merge_candidate" && result.mergeCandidate) {
		return {
			status: "merge_candidate" as const,
			candidate: result.mergeCandidate,
		};
	}
	if (result.status === "invalid_merge_target") {
		return { status: "invalid_merge_target" as const };
	}
	if (result.status === "capacity_exceeded") {
		const capacity = await checkCapacity(env, organizationId, "cargo", 1);
		throw new CapacityExceededError({
			resource: "cargo",
			current: capacity.current,
			limit: capacity.limit,
			tier: capacity.tier,
			isExpired: capacity.isExpired,
			canAdd: capacity.canAdd,
		});
	}
	if (result.status === "error") {
		throw new Error(result.error ?? "Ingest failed");
	}

	if (!result.item) {
		throw new Error("Ingest succeeded but no item returned");
	}
	return { status: result.status as "merged" | "created", item: result.item };
}

/**
 * Update an existing inventory item.
 * Security: Ensures the item belongs to the organization.
 * Also updates the vector embedding for semantic search.
 */
export async function updateItem(
	env: Env,
	organizationId: string,
	itemId: string,
	data: CargoItemUpdateInput,
) {
	const d1 = drizzle(env.DB);

	const [existing] = await d1
		.select()
		.from(cargo)
		.where(and(eq(cargo.id, itemId), eq(cargo.organizationId, organizationId)))
		.limit(1);

	if (!existing) {
		return null;
	}

	const nextExpiresAt =
		data.expiresAt !== undefined ? data.expiresAt : existing.expiresAt;
	const nextName = data.name ?? existing.name;
	const nextUnit = data.unit ?? (existing.unit as CargoItemInput["unit"]);
	const nextQuantity =
		data.quantity !== undefined
			? normalizeCargoQuantity(data.quantity, nextUnit)
			: existing.quantity;
	const nextStatus = calculateInventoryStatus(nextExpiresAt);
	const nextDomain =
		data.domain ?? (existing.domain as CargoItemInput["domain"]);
	const base = computeBaseFields(nextQuantity, nextUnit, nextName);

	const [updatedItem] = await d1
		.update(cargo)
		.set({
			name: nextName,
			quantity: nextQuantity,
			unit: nextUnit,
			baseQuantity: base.baseQuantity,
			baseUnit: base.baseUnit,
			domain: nextDomain,
			status: nextStatus,
			expiresAt: nextExpiresAt,
			updatedAt: new Date(),
		})
		.where(and(eq(cargo.id, itemId), eq(cargo.organizationId, organizationId)))
		.returning();

	if (updatedItem && data.tags !== undefined) {
		await setCargoTags(
			env.DB,
			organizationId,
			itemId,
			dedupeTagSlugs(data.tags),
		);
	}

	if (updatedItem && data.name !== undefined) {
		upsertCargoVector(env, organizationId, {
			id: updatedItem.id,
			name: updatedItem.name,
			domain: updatedItem.domain ?? "food",
		}).catch((err) => log.error("[Vector] upsert failed for update:", err));
	}

	if (!updatedItem) {
		return null;
	}

	const tagMap = await getTagsForCargoIds(env.DB, [itemId]);
	return { ...updatedItem, tags: tagMap.get(itemId) ?? [] };
}

/**
 * Delete (Jettison) an item from the inventory.
 * Security: Ensures the item belongs to the organization.
 */
export async function jettisonItem(
	env: Env,
	organizationId: string,
	itemId: string,
) {
	const d1 = drizzle(env.DB);

	await d1
		.delete(cargo)
		.where(and(eq(cargo.id, itemId), eq(cargo.organizationId, organizationId)));

	deleteCargoVectors(env, [itemId]).catch((err) =>
		log.error("[Vector] delete failed:", err),
	);
}

/**
 * Fetch inventory items that are expiring within the specified number of days.
 * Returns items ordered by expiration date (soonest first).
 *
 * @param db - D1 Database instance
 * @param organizationId - Organization ID to filter inventory
 * @param daysUntilExpiry - Number of days to look ahead (default: 7)
 * @param limit - Maximum number of items to return (default: 10)
 */
export async function getExpiringCargo(
	db: D1Database,
	organizationId: string,
	daysUntilExpiry = 7,
	limit = 10,
	domain?: string,
	now = new Date(),
) {
	const d1 = drizzle(db);
	const { startOfToday, endOfWindow } = getExpiringCargoBounds(
		daysUntilExpiry,
		now,
	);

	return await d1
		.select()
		.from(cargo)
		.where(
			and(
				eq(cargo.organizationId, organizationId),
				isNotNull(cargo.expiresAt),
				lte(cargo.expiresAt, endOfWindow),
				gte(cargo.expiresAt, startOfToday),
				...(domain ? [eq(cargo.domain, domain)] : []),
			),
		)
		.orderBy(asc(cargo.expiresAt))
		.limit(limit);
}

/**
 * Fetch inventory items whose expiry calendar date is before today (UTC).
 * Optional lookback limits how far back to search (default 30 days).
 */
export async function getExpiredCargo(
	db: D1Database,
	organizationId: string,
	daysBack = 30,
	limit = 200,
	domain?: string,
	now = new Date(),
) {
	const d1 = drizzle(db);
	const { startOfToday, earliest } = getExpiredCargoBounds(daysBack, now);

	return await d1
		.select()
		.from(cargo)
		.where(
			and(
				eq(cargo.organizationId, organizationId),
				isNotNull(cargo.expiresAt),
				lt(cargo.expiresAt, startOfToday),
				gte(cargo.expiresAt, earliest),
				...(domain ? [eq(cargo.domain, domain)] : []),
			),
		)
		.orderBy(desc(cargo.expiresAt))
		.limit(limit);
}

/**
 * Get a count summary of inventory for the dashboard.
 *
 * @param db - D1 Database instance
 * @param organizationId - Organization ID to filter inventory
 */
export async function getCargoStats(
	db: D1Database,
	organizationId: string,
	now = new Date(),
) {
	const d1 = drizzle(db);

	const { startOfToday, endOfWindow } = getExpiringCargoBounds(7, now);

	// Three SQL COUNT aggregates in a single D1 batch round-trip.
	// Evaluates entirely inside D1 (SQLite) using the cargo_org_idx index —
	// only three integer rows cross the network instead of all cargo row data.
	const [totalResult, expiringResult, expiredResult] = await d1.batch([
		d1
			.select({ count: sql<number>`count(*)` })
			.from(cargo)
			.where(eq(cargo.organizationId, organizationId)),
		d1
			.select({ count: sql<number>`count(*)` })
			.from(cargo)
			.where(
				and(
					eq(cargo.organizationId, organizationId),
					isNotNull(cargo.expiresAt),
					gte(cargo.expiresAt, startOfToday),
					lte(cargo.expiresAt, endOfWindow),
				),
			),
		d1
			.select({ count: sql<number>`count(*)` })
			.from(cargo)
			.where(
				and(
					eq(cargo.organizationId, organizationId),
					isNotNull(cargo.expiresAt),
					lt(cargo.expiresAt, startOfToday),
				),
			),
	]);

	return {
		totalItems: totalResult[0]?.count ?? 0,
		expiringCount: expiringResult[0]?.count ?? 0,
		expiredCount: expiredResult[0]?.count ?? 0,
	};
}

const APPLY_IMPORT_MAX_ROWS = 500;
const CARGO_IMPORT_UPDATE_BATCH_SIZE = 20;

type CargoRow = typeof cargo.$inferSelect;

function buildCargoImportUpdateSet(
	existing: CargoRow,
	item: ParsedCsvItem,
): {
	set: {
		name: string;
		quantity: number;
		unit: string;
		baseQuantity: number;
		baseUnit: string;
		domain: string;
		status: string;
		expiresAt: Date | null;
		updatedAt: Date;
	};
	vectorPayload?: { id: string; name: string; domain: string };
} {
	const nextExpiresAt = item.expiresAt
		? new Date(`${item.expiresAt}T00:00:00Z`)
		: existing.expiresAt;
	const nextName = item.name;
	const nextUnit = normalizeUnitAlias(item.unit);
	const nextQuantity = normalizeCargoQuantity(item.quantity, nextUnit);
	const nextStatus = calculateInventoryStatus(nextExpiresAt);
	const nextDomain =
		(item.domain as CargoItemInput["domain"]) ??
		(existing.domain as CargoItemInput["domain"]);
	const base = computeBaseFields(nextQuantity, nextUnit, nextName);

	return {
		set: {
			name: nextName,
			quantity: nextQuantity,
			unit: nextUnit,
			baseQuantity: base.baseQuantity,
			baseUnit: base.baseUnit,
			domain: nextDomain,
			status: nextStatus,
			expiresAt: nextExpiresAt,
			updatedAt: new Date(),
		},
		vectorPayload:
			nextName !== existing.name
				? {
						id: existing.id,
						name: nextName,
						domain: nextDomain ?? "food",
					}
				: undefined,
	};
}

async function applyCargoTagsForImportBatch(
	db: D1Database,
	updates: Array<{ cargoId: string; tagIds: string[] }>,
): Promise<void> {
	if (updates.length === 0) return;
	const d1 = drizzle(db);
	const cargoIds = updates.map((row) => row.cargoId);

	for (const idChunk of chunkArray(cargoIds, 99)) {
		await d1.delete(cargoTag).where(inArray(cargoTag.cargoId, idChunk));
	}

	const junctionRows = updates.flatMap((row) =>
		row.tagIds.map((tagId) => ({ cargoId: row.cargoId, tagId })),
	);
	for (const chunk of chunkArray(junctionRows, D1_MAX_TAG_ROWS_PER_STATEMENT)) {
		await d1.insert(cargoTag).values(chunk);
	}
}

async function bulkUpdateCargoImportItems(
	env: Env,
	organizationId: string,
	items: ParsedCsvItem[],
	existingById: Map<string, CargoRow>,
	tagIdsBySlug: Map<string, string>,
): Promise<{
	updated: number;
	errors: Array<{ name: string; error: string }>;
}> {
	const result = {
		updated: 0,
		errors: [] as Array<{ name: string; error: string }>,
	};
	const d1 = drizzle(env.DB);

	for (const batch of chunkArray(items, CARGO_IMPORT_UPDATE_BATCH_SIZE)) {
		const validItems = batch.filter(
			(item): item is ParsedCsvItem & { id: string } =>
				!!item.id && existingById.has(item.id),
		);
		if (validItems.length === 0) continue;

		try {
			const updateStmts = validItems.map((item) => {
				const { set } = buildCargoImportUpdateSet(
					existingById.get(item.id) as CargoRow,
					item,
				);
				return d1
					.update(cargo)
					.set(set)
					.where(
						and(
							eq(cargo.id, item.id),
							eq(cargo.organizationId, organizationId),
						),
					);
			});

			// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
			await d1.batch(updateStmts as [any, ...any[]]);

			const tagUpdates = validItems.map((item) => {
				const slugs = dedupeTagSlugs(item.tags ?? []);
				const tagIds = slugs.map((slug) => {
					const id = tagIdsBySlug.get(slug);
					if (!id) throw new Error(`tag_not_resolved:${slug}`);
					return id;
				});
				return { cargoId: item.id, tagIds };
			});
			await applyCargoTagsForImportBatch(env.DB, tagUpdates);

			const vectorPayloads = validItems
				.map(
					(item) =>
						buildCargoImportUpdateSet(
							existingById.get(item.id) as CargoRow,
							item,
						).vectorPayload,
				)
				.filter((payload): payload is NonNullable<typeof payload> => !!payload);

			if (vectorPayloads.length > 0) {
				upsertCargoVectors(env, organizationId, vectorPayloads).catch((err) =>
					log.error("[Vector] bulk upsert failed for import update:", err),
				);
			}

			result.updated += validItems.length;
		} catch (batchError) {
			for (const item of validItems) {
				try {
					const updateData: CargoItemUpdateInput = {
						name: item.name,
						quantity: item.quantity,
						unit: normalizeUnitAlias(item.unit) as CargoItemInput["unit"],
						domain: (item.domain as CargoItemInput["domain"]) ?? "food",
						tags: item.tags ?? [],
						expiresAt: item.expiresAt
							? new Date(`${item.expiresAt}T00:00:00Z`)
							: undefined,
					};
					const updated = await updateItem(
						env,
						organizationId,
						item.id,
						updateData,
					);
					if (updated) result.updated += 1;
				} catch (e) {
					result.errors.push({
						name: item.name,
						error:
							e instanceof Error
								? e.message
								: batchError instanceof Error
									? batchError.message
									: String(e),
					});
				}
			}
		}
	}

	return result;
}

export interface ApplyCargoImportResult {
	imported: number;
	updated: number;
	errors: Array<{ name: string; error: string }>;
}

/**
 * Shared import logic: apply parsed cargo rows (from CSV or batch JSON).
 * Upsert by id when present and existing in org; otherwise use ingestCargoItems.
 */
export async function applyCargoImport(
	env: Env,
	organizationId: string,
	parsedItems: ParsedCsvItem[],
): Promise<ApplyCargoImportResult> {
	const result: ApplyCargoImportResult = {
		imported: 0,
		updated: 0,
		errors: [],
	};
	const items = parsedItems.slice(0, APPLY_IMPORT_MAX_ROWS);
	const d1 = drizzle(env.DB);

	const existingRows = await d1
		.select({ id: cargo.id })
		.from(cargo)
		.where(eq(cargo.organizationId, organizationId));
	const existingIds = new Set(existingRows.map((r) => r.id));

	const toUpdate: ParsedCsvItem[] = [];
	const toCreate: ParsedCsvItem[] = [];
	for (const item of items) {
		if (item.id && existingIds.has(item.id)) {
			toUpdate.push(item);
		} else {
			toCreate.push(item);
		}
	}

	if (toUpdate.length > 0) {
		const updateIds = toUpdate
			.map((item) => item.id)
			.filter((id): id is string => !!id);
		const existingCargoRows = await chunkedQuery(updateIds, (chunk) =>
			d1
				.select()
				.from(cargo)
				.where(
					and(
						eq(cargo.organizationId, organizationId),
						inArray(cargo.id, chunk),
					),
				),
		);
		const existingById = new Map(existingCargoRows.map((row) => [row.id, row]));

		const allTagSlugs = uniqueTagSlugs(
			toUpdate.flatMap((item) => dedupeTagSlugs(item.tags ?? [])),
		);
		const tagIdsBySlug = new Map<string, string>();
		if (allTagSlugs.length > 0) {
			const resolvedTagIds = await resolveTagIds(
				env.DB,
				organizationId,
				allTagSlugs,
			);
			for (let i = 0; i < allTagSlugs.length; i++) {
				tagIdsBySlug.set(allTagSlugs[i], resolvedTagIds[i]);
			}
		}

		const bulkResult = await bulkUpdateCargoImportItems(
			env,
			organizationId,
			toUpdate,
			existingById,
			tagIdsBySlug,
		);
		result.updated += bulkResult.updated;
		result.errors.push(...bulkResult.errors);
	}

	if (toCreate.length > 0) {
		const ingestItems: IngestItem[] = toCreate.map((p) => ({
			name: p.name,
			quantity: p.quantity,
			unit: normalizeUnitAlias(p.unit) as SupportedUnit,
			domain: (p.domain as (typeof ITEM_DOMAINS)[number]) ?? "food",
			tags: Array.isArray(p.tags) ? p.tags : [],
			expiresAt: p.expiresAt ? new Date(`${p.expiresAt}T00:00:00Z`) : undefined,
		}));
		const ingestResults = await ingestCargoItems(
			env,
			organizationId,
			ingestItems,
			{
				strictMergeTarget: false,
				// Import/MCP/Copilot path is credit-free: skip Workers AI + Vectorize
				// fuzzy merge so apply stays fast and matches preview classification.
				skipVectorPhase: true,
			},
		);
		for (let i = 0; i < ingestResults.length; i++) {
			const r = ingestResults[i];
			const p = toCreate[i];
			if (r.status === "created" || r.status === "merged") {
				if (r.status === "created") result.imported += 1;
				else result.updated += 1;
			} else if (r.status === "capacity_exceeded" || r.status === "error") {
				result.errors.push({ name: p.name, error: r.error ?? r.status });
			}
		}
	}

	return result;
}

/**
 * One-time cleanup utility to merge duplicate inventory records.
 * Groups by normalized name + unit compatibility and consolidates quantities.
 */
export async function deduplicateCargo(db: D1Database, organizationId: string) {
	const d1 = drizzle(db);
	const items = await d1
		.select()
		.from(cargo)
		.where(eq(cargo.organizationId, organizationId))
		.orderBy(asc(cargo.createdAt));

	const groups = new Map<string, (typeof cargo.$inferSelect)[]>();
	for (const item of items) {
		const normalizedName = normalizeForCargoDedup(item.name);
		const key = `${normalizedName}__${item.domain}`;
		const existing = groups.get(key) ?? [];
		existing.push(item);
		groups.set(key, existing);
	}

	let mergedGroups = 0;
	let deletedItems = 0;

	for (const bucket of groups.values()) {
		const processed = new Set<string>();
		for (const primary of bucket) {
			if (processed.has(primary.id)) continue;
			processed.add(primary.id);

			let mergedQuantity = primary.quantity;
			const toDelete: string[] = [];
			for (const candidate of bucket) {
				if (candidate.id === primary.id || processed.has(candidate.id))
					continue;
				const converted = convertForMerge(
					candidate.quantity,
					candidate.unit as SupportedUnit,
					primary.unit as SupportedUnit,
					primary.name,
				);
				if (converted === null) continue;

				mergedQuantity += converted;
				toDelete.push(candidate.id);
				processed.add(candidate.id);
			}

			if (toDelete.length === 0) continue;

			const normalizedQty = normalizeCargoQuantity(
				mergedQuantity,
				primary.unit as SupportedUnit,
			);

			await d1
				.update(cargo)
				.set({ quantity: normalizedQty, updatedAt: new Date() })
				.where(eq(cargo.id, primary.id));

			for (const deleteChunk of chunkArray(toDelete, D1_MAX_BOUND_PARAMS)) {
				await d1.delete(cargo).where(inArray(cargo.id, deleteChunk));
			}
			mergedGroups++;
			deletedItems += toDelete.length;
		}
	}

	return { mergedGroups, deletedItems };
}

/**
 * Docks purchased supply items into the cargo.
 * Uses ingestCargoItems for vector-assisted deduplication.
 * Logs to ledger for each docked item.
 */
export async function dockSupplyItems(
	env: Env,
	organizationId: string,
	items: (typeof supplyItem.$inferSelect)[],
) {
	const d1 = drizzle(env.DB);
	const results = { updated: 0, created: 0 };

	if (items.length === 0) return results;

	const ingestItems: IngestItem[] = items.map((it) => ({
		name: it.name,
		quantity: it.quantity,
		unit: toSupportedUnit(it.unit) as SupportedUnit,
		domain: it.domain as (typeof ITEM_DOMAINS)[number],
		tags: [],
	}));

	const ingestResults = await ingestCargoItems(
		env,
		organizationId,
		ingestItems,
		{
			strictMergeTarget: false,
		},
	);

	const hasCapacityError = ingestResults.some(
		(r) => r.status === "capacity_exceeded",
	);
	if (hasCapacityError) {
		const capacity = await checkCapacity(
			env,
			organizationId,
			"cargo",
			items.length,
		);
		throw new CapacityExceededError({
			resource: "cargo",
			current: capacity.current,
			limit: capacity.limit,
			tier: capacity.tier,
			isExpired: capacity.isExpired,
			canAdd: capacity.canAdd,
		});
	}

	const ledgerOps = items.map((it) =>
		d1.insert(ledger).values({
			organizationId,
			amount: 0,
			reason: `dock: ${it.name} (+${it.quantity} ${it.unit})`,
		}),
	);

	for (const r of ingestResults) {
		if (r.status === "merged") results.updated += 1;
		else if (r.status === "created") results.created += 1;
	}

	if (ledgerOps.length > 0) {
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
		await d1.batch(ledgerOps as [any, ...any[]]);
	}

	return results;
}
