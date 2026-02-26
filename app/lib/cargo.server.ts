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
import { normalizeForMatch, tokenMatchScore } from "./matching";
import {
	chunkArray,
	chunkedInsert,
	D1_MAX_BOUND_PARAMS,
} from "./query-utils.server";
import { UnitSchema } from "./schemas/units";
import {
	convertQuantity,
	getUnitMultiplier,
	normalizeUnitAlias,
	type SupportedUnit,
	toSupportedUnit,
} from "./units";

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
}

function isCompatibleUnit(a: string, b: string): boolean {
	return getUnitMultiplier(a as SupportedUnit, b as SupportedUnit) !== null;
}

/**
 * Add a new item to the organization's inventory.
 * Supports merge-on-add to prevent duplicate inventory rows.
 */
export async function addOrMergeItem(
	env: Env,
	organizationId: string,
	data: CargoItemInput,
	options: AddOrMergeItemOptions = {},
) {
	const d1 = drizzle(env.DB);
	const normalizedName = normalizeForMatch(data.name);
	const requestedUnit = data.unit as SupportedUnit;
	const existingItems = await d1
		.select()
		.from(cargo)
		.where(eq(cargo.organizationId, organizationId));

	const mergeIntoExisting = async (targetId: string, score: number) => {
		const target = existingItems.find((item) => item.id === targetId);
		if (!target) return null;

		const convertedQuantity = convertQuantity(
			data.quantity,
			requestedUnit,
			target.unit as SupportedUnit,
		);
		if (convertedQuantity === null) return null;

		const [updatedItem] = await d1
			.update(cargo)
			.set({
				quantity: target.quantity + convertedQuantity,
				updatedAt: new Date(),
			})
			.where(
				and(eq(cargo.id, target.id), eq(cargo.organizationId, organizationId)),
			)
			.returning();

		if (!updatedItem) return null;

		return {
			status: "merged" as const,
			item: updatedItem,
			candidate: {
				id: target.id,
				name: target.name,
				quantity: target.quantity,
				unit: target.unit as SupportedUnit,
				score,
				convertedQuantity,
			},
		};
	};

	if (!options.forceCreateNew && options.mergeTargetId) {
		const explicitTarget = existingItems.find(
			(item) =>
				item.id === options.mergeTargetId &&
				item.domain === data.domain &&
				isCompatibleUnit(item.unit, data.unit),
		);
		if (!explicitTarget) {
			return { status: "invalid_merge_target" as const };
		}
		const merged = await mergeIntoExisting(explicitTarget.id, 1);
		if (!merged) {
			return { status: "invalid_merge_target" as const };
		}
		return { status: "merged" as const, item: merged.item };
	}

	if (!options.forceCreateNew) {
		const exactMatches = existingItems
			.filter(
				(item) =>
					item.domain === data.domain &&
					normalizeForMatch(item.name) === normalizedName &&
					isCompatibleUnit(item.unit, data.unit),
			)
			.sort((a, b) =>
				a.unit === data.unit ? -1 : b.unit === data.unit ? 1 : 0,
			);

		if (exactMatches.length > 0) {
			const merged = await mergeIntoExisting(exactMatches[0].id, 1);
			if (merged) {
				return { status: "merged" as const, item: merged.item };
			}
		}

		if (options.allowFuzzyCandidate) {
			let bestCandidate: MergeCandidate | null = null;
			for (const item of existingItems) {
				if (item.domain !== data.domain) continue;
				if (!isCompatibleUnit(item.unit, data.unit)) continue;
				const score = tokenMatchScore(data.name, item.name);
				if (score < 0.8) continue;
				const convertedQuantity = convertQuantity(
					data.quantity,
					requestedUnit,
					item.unit as SupportedUnit,
				);
				if (convertedQuantity === null) continue;

				if (!bestCandidate || score > bestCandidate.score) {
					bestCandidate = {
						id: item.id,
						name: item.name,
						quantity: item.quantity,
						unit: item.unit as SupportedUnit,
						score,
						convertedQuantity,
					};
				}
			}

			if (bestCandidate) {
				return { status: "merge_candidate" as const, candidate: bestCandidate };
			}
		}
	}

	const capacity = await checkCapacity(env, organizationId, "cargo", 1);
	if (!capacity.allowed) {
		throw new CapacityExceededError({
			resource: "cargo",
			current: capacity.current,
			limit: capacity.limit,
			tier: capacity.tier,
			isExpired: capacity.isExpired,
			canAdd: capacity.canAdd,
		});
	}

	const [newItem] = await d1
		.insert(cargo)
		.values({
			organizationId,
			name: data.name,
			quantity: data.quantity,
			unit: data.unit,
			domain: data.domain,
			status: calculateInventoryStatus(data.expiresAt),
			tags: data.tags,
			expiresAt: data.expiresAt,
			updatedAt: new Date(),
		})
		.returning();

	return { status: "created" as const, item: newItem };
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

	// Update vector embedding if item was found and updated

	return updatedItem;
}

/**
 * Delete (Jettison) an item from the inventory.
 * Security: Ensures the item belongs to the organization.
 */
export async function jettisonItem(
	db: D1Database,
	organizationId: string,
	itemId: string,
) {
	const d1 = drizzle(db);

	return await d1
		.delete(cargo)
		.where(and(eq(cargo.id, itemId), eq(cargo.organizationId, organizationId)));
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
/** Cargo insert: id, organizationId, name, quantity, unit, tags, domain, status, expiresAt, createdAt, updatedAt = 11 params */
const D1_MAX_CARGO_ROWS_PER_STATEMENT = Math.floor(D1_MAX_BOUND_PARAMS / 11);

export interface ApplyCargoImportResult {
	imported: number;
	updated: number;
	errors: Array<{ name: string; error: string }>;
}

/**
 * Shared import logic: apply parsed cargo rows (from CSV or batch JSON).
 * Upsert by id when present and existing in org; otherwise create.
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

	const now = new Date();
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
		const capacity = await checkCapacity(
			env,
			organizationId,
			"cargo",
			toCreate.length,
		);
		if (!capacity.allowed) {
			for (const item of toCreate) {
				result.errors.push({ name: item.name, error: "capacity_exceeded" });
			}
			return result;
		}
		const insertRows = toCreate.map((p) => ({
			id: crypto.randomUUID(),
			organizationId,
			name: p.name,
			quantity: p.quantity,
			unit: normalizeUnitAlias(p.unit),
			domain: (p.domain as (typeof ITEM_DOMAINS)[number]) ?? "food",
			tags: p.tags ?? [],
			status: calculateInventoryStatus(
				p.expiresAt ? new Date(`${p.expiresAt}T00:00:00Z`) : undefined,
			),
			expiresAt: p.expiresAt ? new Date(`${p.expiresAt}T00:00:00Z`) : null,
			createdAt: now,
			updatedAt: now,
		}));
		await chunkedInsert(insertRows, D1_MAX_CARGO_ROWS_PER_STATEMENT, (chunk) =>
			d1.insert(cargo).values(chunk),
		);
		result.imported = insertRows.length;
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
 * - Matches existing items by name and unit (case-insensitive).
 * - Increments quantity for matches.
 * - Creates new items for non-matches.
 * - Logs to ledger.
 */
export async function dockSupplyItems(
	env: Env,
	organizationId: string,
	items: (typeof supplyItem.$inferSelect)[],
) {
	const d1 = drizzle(env.DB);
	const results = {
		updated: 0,
		created: 0,
	};

	const currentCargoCount = await d1
		.select({ count: sql<number>`count(*)` })
		.from(cargo)
		.where(eq(cargo.organizationId, organizationId));

	const cargoMapCount = currentCargoCount[0]?.count ?? 0;

	// 1. Get current cargo for matching
	const currentCargo = await d1
		.select()
		.from(cargo)
		.where(eq(cargo.organizationId, organizationId));

	// Find unit-aware match: same normalized name + convertible units
	function findMatchingCargo(
		supplyName: string,
		supplyUnit: string,
		cargoList: (typeof cargo.$inferSelect)[],
	): typeof cargo.$inferSelect | null {
		const normalizedName = normalizeForMatch(supplyName);
		const supplyUnitSafe = toSupportedUnit(supplyUnit);
		for (const c of cargoList) {
			if (normalizeForMatch(c.name) !== normalizedName) continue;
			const cargoUnit = toSupportedUnit(c.unit);
			if (getUnitMultiplier(supplyUnitSafe, cargoUnit) === null) continue;
			return c;
		}
		return null;
	}

	// Track current quantities (updated as we process) for duplicate supply items
	const quantityByCargoId = new Map<string, number>();
	for (const c of currentCargo) {
		quantityByCargoId.set(c.id, c.quantity);
	}

	// 2. Collect all operations for batching
	const batchOps = [];
	const now = new Date();
	let newRowsCreated = 0;

	for (const item of items) {
		const existing = findMatchingCargo(item.name, item.unit, currentCargo);

		if (existing) {
			const supplyUnit = toSupportedUnit(item.unit);
			const cargoUnit = toSupportedUnit(existing.unit);
			const addQtyInCargoUnit = convertQuantity(
				item.quantity,
				supplyUnit,
				cargoUnit,
			);
			if (addQtyInCargoUnit === null) {
				// Conversion failed (should not happen); fall through to create new
			} else {
				const newTotal =
					(quantityByCargoId.get(existing.id) ?? existing.quantity) +
					addQtyInCargoUnit;
				quantityByCargoId.set(existing.id, newTotal);
				batchOps.push(
					d1
						.update(cargo)
						.set({
							quantity: newTotal,
							updatedAt: now,
						})
						.where(eq(cargo.id, existing.id)),
				);
				results.updated++;
				batchOps.push(
					d1.insert(ledger).values({
						organizationId,
						amount: 0,
						reason: `dock: ${item.name} (+${item.quantity} ${item.unit})`,
					}),
				);
				continue;
			}
		}

		// No match - create new item
		{
			const capacity = await checkCapacity(
				env,
				organizationId,
				"cargo",
				newRowsCreated + 1,
			);
			if (!capacity.allowed) {
				throw new CapacityExceededError({
					resource: "cargo",
					current: cargoMapCount + newRowsCreated,
					limit: capacity.limit,
					tier: capacity.tier,
					isExpired: capacity.isExpired,
					canAdd: capacity.canAdd,
				});
			}

			// Queue insert for new item
			const newItemId = crypto.randomUUID();

			batchOps.push(
				d1.insert(cargo).values({
					id: newItemId,
					organizationId,
					name: item.name,
					quantity: item.quantity,
					unit: item.unit,
					domain: item.domain,
					status: "stable",
					tags: [], // No tags from grocery list currently
					createdAt: now,
					updatedAt: now,
				}),
			);

			// Add to currentCargo so duplicate supply items in same batch can merge
			currentCargo.push({
				id: newItemId,
				organizationId,
				name: item.name,
				quantity: item.quantity,
				unit: item.unit,
				domain: item.domain,
				status: "stable",
				tags: "[]",
				expiresAt: null,
				createdAt: now,
				updatedAt: now,
			} as typeof cargo.$inferSelect);
			quantityByCargoId.set(newItemId, item.quantity);
			results.created++;
			newRowsCreated++;
		}

		// Queue ledger entry
		batchOps.push(
			d1.insert(ledger).values({
				organizationId,
				amount: 0, // No monetary tracking yet
				reason: `dock: ${item.name} (+${item.quantity} ${item.unit})`,
			}),
		);
	}

	// 3. Execute all operations atomically in a single batch
	if (batchOps.length > 0) {
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
		await d1.batch(batchOps as [any, ...any[]]);
	}

	return results;
}
