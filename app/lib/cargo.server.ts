import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
	lt,
	lte,
	sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { cargo, ledger, type supplyItem } from "../db/schema";
import { CapacityExceededError, checkCapacity } from "./capacity.server";
import type { ParsedCsvItem } from "./csv-parser";
import { ITEM_DOMAINS } from "./domain";
import { log } from "./logging.server";
import { normalizeForMatch } from "./matching";
import { chunkArray, D1_MAX_BOUND_PARAMS } from "./query-utils.server";
import { UnitSchema } from "./schemas/units";
import {
	convertQuantity,
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

/**
 * Extends normalizeForMatch with plural stripping for Phase 1 dedup keys.
 * Strips common English plural suffixes so singular/plural variants share the same key:
 *   "eggs" → "egg", "tomatoes" → "tomato", "potatoes" → "potato", "dishes" → "dish"
 * Mirrors normalizeIngredientName in matching.server.ts.
 */
function normalizeForCargoKey(name: string): string {
	const base = normalizeForMatch(name);
	// Order matters: check longer suffixes first
	if (base.endsWith("oes")) return base.slice(0, -2); // tomatoes→tomato, potatoes→potato
	if (base.endsWith("shes")) return base.slice(0, -2); // dishes→dish
	if (base.endsWith("ches")) return base.slice(0, -2); // peaches→peach
	if (base.endsWith("xes")) return base.slice(0, -2); // boxes→box
	if (base.endsWith("zes")) return base.slice(0, -2); // pizzas handled below
	if (base.endsWith("ies")) return `${base.slice(0, -3)}y`; // berries→berry, cherries→cherry
	if (base.endsWith("es") && base.length > 3) return base.slice(0, -1); // grapes→grape
	if (base.endsWith("s") && base.length > 2) return base.slice(0, -1); // eggs→egg, carrots→carrot
	return base;
}

// --- Validation Schemas ---

export const CargoItemSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.transform((v) => v.toLowerCase()),
	quantity: z.coerce.number().min(0, "Quantity must be positive"), // coerce handles string->number from forms
	unit: UnitSchema,
	domain: z.enum(ITEM_DOMAINS).default("food"),
	tags: z.array(z.string().transform((v) => v.toLowerCase())).default([]),
	expiresAt: z.coerce.date().optional(), // Optional date string coercion
});

export type CargoItemInput = z.infer<typeof CargoItemSchema>;
export type CargoItemUpdateInput = Partial<CargoItemInput>;

export function calculateInventoryStatus(expiresAt?: Date | null) {
	if (!expiresAt) return "stable";
	const msPerDay = 1000 * 60 * 60 * 24;
	const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / msPerDay;
	if (daysUntilExpiry < 0) return "biohazard";
	if (daysUntilExpiry < 3) return "decay_imminent";
	return "stable";
}

function normalizeTags(tags: unknown) {
	if (Array.isArray(tags)) {
		return tags.filter((tag) => typeof tag === "string") as string[];
	}
	if (typeof tags === "string") {
		try {
			const parsed = JSON.parse(tags);
			if (Array.isArray(parsed)) {
				return parsed.filter((tag) => typeof tag === "string") as string[];
			}
		} catch {
			return tags
				.split(",")
				.map((tag) => tag.trim())
				.filter(Boolean);
		}
	}
	return [];
}

// --- Database Operations ---

/**
 * Fetch all inventory items for a specific organization.
 * Ordered by creation date descending (newest first).
 */
export async function getCargo(
	db: D1Database,
	organizationId: string,
	domain?: (typeof ITEM_DOMAINS)[number],
) {
	const d1 = drizzle(db);
	const conditions = [eq(cargo.organizationId, organizationId)];

	if (domain) {
		conditions.push(eq(cargo.domain, domain));
	}

	return await d1
		.select()
		.from(cargo)
		.where(and(...conditions))
		.orderBy(desc(cargo.createdAt));
}

/**
 * Retrieves all unique tags for an organization's inventory.
 * Useful for populating tag filter dropdowns.
 */
export async function getCargoTags(
	db: D1Database,
	organizationId: string,
): Promise<string[]> {
	const d1 = drizzle(db);

	const items = await d1
		.select({ tags: cargo.tags })
		.from(cargo)
		.where(eq(cargo.organizationId, organizationId));

	// Extract all tags from all items and deduplicate
	const allTags = new Set<string>();
	for (const item of items) {
		const tags = normalizeTags(item.tags);
		for (const tag of tags) {
			allTags.add(tag);
		}
	}

	return Array.from(allTags).sort();
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

function isCompatibleUnit(a: string, b: string): boolean {
	return getUnitMultiplier(a as SupportedUnit, b as SupportedUnit) !== null;
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
	const existingCargo = await d1
		.select()
		.from(cargo)
		.where(eq(cargo.organizationId, organizationId));

	const cargoById = new Map<string, typeof cargo.$inferSelect>();
	const cargoByKey = new Map<string, (typeof cargo.$inferSelect)[]>();
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
				isCompatibleUnit(target.unit, it.unit)
			) {
				const converted = convertQuantity(
					it.quantity,
					unit,
					target.unit as SupportedUnit,
				);
				if (converted !== null) {
					resolved[i] = {
						action: "merge",
						targetId: target.id,
						convertedQty: converted,
					};
					const cur = quantityByCargoId.get(target.id) ?? target.quantity;
					quantityByCargoId.set(target.id, cur + converted);
					continue;
				}
			}
			if (options?.strictMergeTarget) {
				resolved[i] = { action: "invalid_merge_target" };
				continue;
			}
		}

		const exactBucket = cargoByKey.get(key) ?? [];
		const exact = exactBucket.find((c) => isCompatibleUnit(c.unit, it.unit));
		if (exact) {
			const converted = convertQuantity(
				it.quantity,
				unit,
				exact.unit as SupportedUnit,
			);
			if (converted !== null) {
				resolved[i] = {
					action: "merge",
					targetId: exact.id,
					convertedQty: converted,
				};
				const cur = quantityByCargoId.get(exact.id) ?? exact.quantity;
				quantityByCargoId.set(exact.id, cur + converted);
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
					isCompatibleUnit(target.unit, it.unit)
				) {
					const converted = convertQuantity(
						it.quantity,
						it.unit as SupportedUnit,
						target.unit as SupportedUnit,
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
							quantityByCargoId.set(target.id, cur + converted);
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

	for (let i = 0; i < items.length; i++) {
		const it = items[i];
		const r = resolved[i] ?? { action: "create" as const };
		if (r.action === "merge") {
			const target = cargoById.get(r.targetId);
			const newQty = quantityByCargoId.get(r.targetId);
			if (!target || newQty === undefined) continue;
			if (!mergedTargetIds.has(r.targetId)) {
				mergedTargetIds.add(r.targetId);
				batchOps.push(
					d1
						.update(cargo)
						.set({ quantity: newQty, updatedAt: now })
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
		const tagsJson = Array.isArray(it.tags)
			? JSON.stringify(it.tags)
			: typeof it.tags === "string"
				? it.tags
				: "[]";
		batchOps.push(
			d1.insert(cargo).values({
				id: newId,
				organizationId,
				name: it.name,
				quantity: it.quantity,
				unit: it.unit,
				domain: it.domain,
				tags: tagsJson,
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
			quantity: it.quantity,
			unit: it.unit,
			domain: it.domain,
			tags: tagsJson,
			status: calculateInventoryStatus(it.expiresAt),
			expiresAt: it.expiresAt ?? null,
			createdAt: now,
			updatedAt: now,
		} as typeof cargo.$inferSelect;
		cargoById.set(newId, newRow);
		quantityByCargoId.set(newId, it.quantity);
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
	}

	if (batchOps.length > 0) {
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
		await d1.batch(batchOps as [any, ...any[]]);
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
 * Legacy wrapper that always creates a new row.
 * Kept for backwards compatibility with existing call sites.
 */
export async function addItem(
	env: Env,
	organizationId: string,
	data: CargoItemInput,
) {
	const result = await addOrMergeItem(env, organizationId, data, {
		forceCreateNew: true,
	});

	return [result.item];
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

	const nextTags =
		data.tags !== undefined ? data.tags : normalizeTags(existing.tags);
	const nextExpiresAt =
		data.expiresAt !== undefined ? data.expiresAt : existing.expiresAt;
	const nextName = data.name ?? existing.name;
	const nextQuantity = data.quantity ?? existing.quantity;
	const nextUnit = data.unit ?? (existing.unit as CargoItemInput["unit"]);
	const nextStatus = calculateInventoryStatus(nextExpiresAt);
	const nextData: CargoItemInput = {
		name: nextName,
		quantity: nextQuantity,
		unit: nextUnit,
		domain: data.domain ?? (existing.domain as CargoItemInput["domain"]),
		tags: nextTags,
		expiresAt: nextExpiresAt ?? undefined,
	};

	const [updatedItem] = await d1
		.update(cargo)
		.set({
			name: nextData.name,
			quantity: nextData.quantity,
			unit: nextData.unit,
			domain: nextData.domain,
			status: nextStatus,
			tags: nextData.tags,
			expiresAt: nextData.expiresAt,
			updatedAt: new Date(),
		})
		.where(and(eq(cargo.id, itemId), eq(cargo.organizationId, organizationId)))
		.returning();

	if (updatedItem && data.name !== undefined) {
		upsertCargoVector(env, organizationId, {
			id: updatedItem.id,
			name: updatedItem.name,
			domain: updatedItem.domain ?? "food",
		}).catch((err) => log.error("[Vector] upsert failed for update:", err));
	}

	return updatedItem;
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
) {
	const d1 = drizzle(db);

	const now = new Date();
	const futureDate = new Date(
		now.getTime() + daysUntilExpiry * 24 * 60 * 60 * 1000,
	);

	return await d1
		.select()
		.from(cargo)
		.where(
			and(
				eq(cargo.organizationId, organizationId),
				isNotNull(cargo.expiresAt),
				lte(cargo.expiresAt, futureDate),
				gte(cargo.expiresAt, now), // Only items not yet expired
			),
		)
		.orderBy(asc(cargo.expiresAt))
		.limit(limit);
}

/**
 * Get a count summary of inventory for the dashboard.
 *
 * @param db - D1 Database instance
 * @param organizationId - Organization ID to filter inventory
 */
export async function getCargoStats(db: D1Database, organizationId: string) {
	const d1 = drizzle(db);

	const now = new Date();
	const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

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
					gte(cargo.expiresAt, now),
					lte(cargo.expiresAt, sevenDaysOut),
				),
			),
		d1
			.select({ count: sql<number>`count(*)` })
			.from(cargo)
			.where(
				and(
					eq(cargo.organizationId, organizationId),
					isNotNull(cargo.expiresAt),
					lt(cargo.expiresAt, now),
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

	for (const item of toUpdate) {
		if (!item.id) continue;
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
				error: e instanceof Error ? e.message : String(e),
			});
		}
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
		const normalizedName = normalizeForMatch(item.name);
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
				const converted = convertQuantity(
					candidate.quantity,
					candidate.unit as SupportedUnit,
					primary.unit as SupportedUnit,
				);
				if (converted === null) continue;

				mergedQuantity += converted;
				toDelete.push(candidate.id);
				processed.add(candidate.id);
			}

			if (toDelete.length === 0) continue;

			await d1
				.update(cargo)
				.set({ quantity: mergedQuantity, updatedAt: new Date() })
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
