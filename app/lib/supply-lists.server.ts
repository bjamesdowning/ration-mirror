import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
	supplyItem,
	supplyList,
	supplyOperation,
	supplyStaple,
	supplyStoreAisle,
	supplyStoreProfile,
} from "~/db/schema";
import { computeBaseFields, effectiveBaseFields } from "./base-quantity";
import { checkCapacity } from "./capacity.server";
import { fetchOrgCargoIndex } from "./cargo-index.server";
import { normalizeForCargoDedup } from "./matching.server";
import {
	chunkArray,
	D1_MAX_SUPPLY_ROWS_PER_STATEMENT,
} from "./query-utils.server";
import { getQueueJob } from "./queue-job.server";
import { ensureLiveSupplyList, getSupplyListById } from "./supply.server";
import { inferSupplyCategory } from "./supply-categories";
import { normalizeSupplyOrigins } from "./supply-item-origins";
import { insertSupplyListWithQuota } from "./supply-list-capacity.server";
import {
	catalogSummaryFromRow,
	supplyListEtag,
} from "./supply-list-dto.server";
import {
	InvalidListStateError,
	SupplyItemLimitError,
	SupplyListNotFoundError,
} from "./supply-list-errors";
import {
	canArchiveSupplyList,
	canMutateSupplyItems,
	canShopSupplyList,
	isUniqueConstraintError,
	resolveSupplyListState,
	SUPPLY_SAVED_ITEM_LIMIT,
	type SupplyCreatedFrom,
	type SupplyListKind,
} from "./supply-list-kinds";
import { loadSupplyListRow } from "./supply-list-target.server";

type SupplyItemRow = typeof supplyItem.$inferSelect;

function itemIdentity(name: string, domain: string) {
	return `${normalizeForCargoDedup(name)}::${domain || "food"}`;
}

export function cloneSupplyItemValues(
	item: SupplyItemRow,
	targetListId: string,
	options?: { resetPurchased?: boolean },
) {
	const now = new Date();
	return {
		id: crypto.randomUUID(),
		listId: targetListId,
		name: item.name,
		quantity: item.quantity,
		unit: item.unit,
		baseQuantity: item.baseQuantity,
		baseUnit: item.baseUnit,
		domain: item.domain,
		isPurchased: options?.resetPurchased ? false : item.isPurchased,
		sourceMealId: item.sourceMealId,
		sourceMealIds: item.sourceMealIds,
		sourceOrigins: normalizeSupplyOrigins(item.sourceOrigins),
		sourceCargoId: item.sourceCargoId,
		note: item.note,
		category: item.category,
		sortOrder: item.sortOrder,
		updatedAt: now,
	};
}

async function loadItems(db: D1Database, listId: string) {
	const d1 = drizzle(db);
	return d1.select().from(supplyItem).where(eq(supplyItem.listId, listId));
}

async function insertItemChunks(
	d1: ReturnType<typeof drizzle>,
	rows: ReturnType<typeof cloneSupplyItemValues>[],
) {
	for (const chunk of chunkArray(rows, D1_MAX_SUPPLY_ROWS_PER_STATEMENT)) {
		if (chunk.length === 0) continue;
		await d1.insert(supplyItem).values(chunk);
	}
}

export async function getSupplyCatalog(env: Env, organizationId: string) {
	await ensureLiveSupplyList(env.DB, organizationId);
	const d1 = drizzle(env.DB);
	const [lists, counts, stores, capacity] = await Promise.all([
		d1
			.select()
			.from(supplyList)
			.where(eq(supplyList.organizationId, organizationId)),
		d1
			.select({
				listId: supplyItem.listId,
				itemCount: sql<number>`count(*)`,
				purchasedCount: sql<number>`coalesce(sum(case when ${supplyItem.isPurchased} then 1 else 0 end), 0)`,
			})
			.from(supplyItem)
			.innerJoin(supplyList, eq(supplyItem.listId, supplyList.id))
			.where(eq(supplyList.organizationId, organizationId))
			.groupBy(supplyItem.listId),
		d1
			.select({
				id: supplyStoreProfile.id,
				name: supplyStoreProfile.name,
			})
			.from(supplyStoreProfile)
			.where(eq(supplyStoreProfile.organizationId, organizationId)),
		checkCapacity(env, organizationId, "supplyLists"),
	]);

	const countById = new Map(
		counts.map((row) => [
			row.listId,
			{
				itemCount: Math.trunc(Number(row.itemCount ?? 0)) || 0,
				purchasedCount: Math.trunc(Number(row.purchasedCount ?? 0)) || 0,
			},
		]),
	);
	const storeNameById = new Map(stores.map((row) => [row.id, row.name]));

	const summaries = lists.map((list) =>
		catalogSummaryFromRow({
			...list,
			itemCount: countById.get(list.id)?.itemCount,
			purchasedCount: countById.get(list.id)?.purchasedCount,
			storeName: list.storeProfileId
				? (storeNameById.get(list.storeProfileId) ?? null)
				: null,
		}),
	);

	const live = summaries.find((row) => row.state === "live") ?? null;
	const saved = summaries
		.filter((row) => row.state === "saved")
		.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
	const templates = summaries
		.filter((row) => row.state === "template")
		.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
	const archived = summaries
		.filter((row) => row.state === "archived")
		.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

	return {
		live,
		saved,
		templates,
		archived,
		capacity: {
			current: capacity.current,
			limit: capacity.limit,
			canAdd: capacity.canAdd,
			tier: capacity.tier,
		},
	};
}

async function findBySourceReference(
	db: D1Database,
	organizationId: string,
	createdFrom: string,
	sourceReference: string,
) {
	const d1 = drizzle(db);
	const [row] = await d1
		.select()
		.from(supplyList)
		.where(
			and(
				eq(supplyList.organizationId, organizationId),
				eq(supplyList.createdFrom, createdFrom),
				eq(supplyList.sourceReference, sourceReference),
			),
		)
		.limit(1);
	return row ?? null;
}

export async function createCatalogList(options: {
	env: Env;
	organizationId: string;
	name: string;
	kind: "saved" | "template";
	seed?: {
		type: "empty" | "copy";
		sourceListId?: string;
		resetPurchased?: boolean;
	};
	clientKey?: string;
}) {
	if (options.clientKey) {
		const existing = await findBySourceReference(
			options.env.DB,
			options.organizationId,
			"manual",
			options.clientKey,
		);
		if (existing) {
			return getSupplyListById(
				options.env.DB,
				options.organizationId,
				existing.id,
			);
		}
	}

	const listId = crypto.randomUUID();
	let sourceItems: SupplyItemRow[] = [];
	if (options.seed?.type === "copy" && options.seed.sourceListId) {
		const source = await loadSupplyListRow(
			options.env.DB,
			options.organizationId,
			options.seed.sourceListId,
		);
		if (!source) throw new SupplyListNotFoundError();
		sourceItems = await loadItems(options.env.DB, source.id);
		if (sourceItems.length > SUPPLY_SAVED_ITEM_LIMIT) {
			throw new SupplyItemLimitError(SUPPLY_SAVED_ITEM_LIMIT);
		}
	}

	await insertSupplyListWithQuota({
		env: options.env,
		organizationId: options.organizationId,
		values: {
			id: listId,
			name: options.name,
			kind: options.kind,
			createdFrom: options.seed?.type === "copy" ? "duplicate" : "manual",
			sourceListId: options.seed?.sourceListId ?? null,
			sourceReference: options.clientKey ?? null,
		},
	});

	if (sourceItems.length > 0) {
		const d1 = drizzle(options.env.DB);
		await insertItemChunks(
			d1,
			sourceItems.map((item) =>
				cloneSupplyItemValues(item, listId, {
					resetPurchased:
						options.seed?.resetPurchased ?? options.kind === "template",
				}),
			),
		);
	}

	return getSupplyListById(options.env.DB, options.organizationId, listId);
}

export async function duplicateSupplyList(options: {
	env: Env;
	organizationId: string;
	listId: string;
	name?: string;
	kind?: "saved" | "template";
	resetPurchased?: boolean;
	clientKey?: string;
	createdFrom?: SupplyCreatedFrom;
	sourceReference?: string;
}) {
	const source = await loadSupplyListRow(
		options.env.DB,
		options.organizationId,
		options.listId,
	);
	if (!source) throw new SupplyListNotFoundError();

	const sourceReference = options.sourceReference ?? options.clientKey ?? null;
	if (sourceReference) {
		const existing = await findBySourceReference(
			options.env.DB,
			options.organizationId,
			options.createdFrom ?? "duplicate",
			sourceReference,
		);
		if (existing) {
			return getSupplyListById(
				options.env.DB,
				options.organizationId,
				existing.id,
			);
		}
	}

	const items = await loadItems(options.env.DB, source.id);
	if (items.length > SUPPLY_SAVED_ITEM_LIMIT) {
		throw new SupplyItemLimitError(SUPPLY_SAVED_ITEM_LIMIT);
	}

	const kind: SupplyListKind = options.kind ?? "saved";
	const listId = crypto.randomUUID();
	const createdFrom = options.createdFrom ?? "duplicate";
	try {
		await insertSupplyListWithQuota({
			env: options.env,
			organizationId: options.organizationId,
			values: {
				id: listId,
				name: options.name ?? `${source.name} copy`,
				kind,
				createdFrom,
				sourceListId: source.id,
				sourceReference,
			},
		});
	} catch (error) {
		if (sourceReference && isUniqueConstraintError(error)) {
			const existing = await findBySourceReference(
				options.env.DB,
				options.organizationId,
				createdFrom,
				sourceReference,
			);
			if (existing) {
				return getSupplyListById(
					options.env.DB,
					options.organizationId,
					existing.id,
				);
			}
		}
		throw error;
	}

	const d1 = drizzle(options.env.DB);
	await insertItemChunks(
		d1,
		items.map((item) =>
			cloneSupplyItemValues(item, listId, {
				resetPurchased: options.resetPurchased ?? kind === "template",
			}),
		),
	);
	return getSupplyListById(options.env.DB, options.organizationId, listId);
}

export async function snapshotLiveSupplyList(options: {
	env: Env;
	organizationId: string;
	name: string;
	clientKey?: string;
}) {
	const live = await ensureLiveSupplyList(
		options.env.DB,
		options.organizationId,
	);
	if (!live) throw new SupplyListNotFoundError();
	return duplicateSupplyList({
		env: options.env,
		organizationId: options.organizationId,
		listId: live.id,
		name: options.name,
		kind: "saved",
		resetPurchased: false,
		clientKey: options.clientKey,
		createdFrom: "live_snapshot",
		sourceReference: options.clientKey,
	});
}

export async function archiveSupplyList(
	db: D1Database,
	organizationId: string,
	listId: string,
) {
	const list = await loadSupplyListRow(db, organizationId, listId);
	if (!list) throw new SupplyListNotFoundError();
	const state = resolveSupplyListState(list);
	if (!canArchiveSupplyList(state)) {
		throw new InvalidListStateError(state);
	}
	const d1 = drizzle(db);
	await d1
		.update(supplyList)
		.set({
			archivedAt: new Date(),
			updatedAt: new Date(),
			revision: (list.revision ?? 0) + 1,
		})
		.where(eq(supplyList.id, listId));
	return getSupplyListById(db, organizationId, listId);
}

export async function resetPurchasedSupplyItems(
	db: D1Database,
	organizationId: string,
	listId: string,
) {
	const list = await loadSupplyListRow(db, organizationId, listId);
	if (!list) throw new SupplyListNotFoundError();
	const state = resolveSupplyListState(list);
	if (!canShopSupplyList(state)) {
		throw new InvalidListStateError(state);
	}
	const d1 = drizzle(db);
	const now = new Date();
	await d1.batch([
		d1
			.update(supplyItem)
			.set({ isPurchased: false, updatedAt: now })
			.where(eq(supplyItem.listId, listId)),
		d1
			.update(supplyList)
			.set({
				updatedAt: now,
				revision: (list.revision ?? 0) + 1,
			})
			.where(eq(supplyList.id, listId)),
	]);
	return getSupplyListById(db, organizationId, listId);
}

export function mergeSupplyItemQuantities(
	existing: Pick<
		SupplyItemRow,
		"quantity" | "unit" | "name" | "baseQuantity" | "baseUnit"
	>,
	incoming: Pick<
		SupplyItemRow,
		"quantity" | "unit" | "name" | "baseQuantity" | "baseUnit"
	>,
) {
	const existingBase = effectiveBaseFields(
		existing.quantity,
		existing.unit,
		existing.baseQuantity,
		existing.baseUnit,
		existing.name,
	);
	const incomingBase = effectiveBaseFields(
		incoming.quantity,
		incoming.unit,
		incoming.baseQuantity,
		incoming.baseUnit,
		incoming.name,
	);
	if (existingBase.baseUnit !== incomingBase.baseUnit) {
		return {
			quantity: existing.quantity + incoming.quantity,
			unit: existing.unit,
			baseQuantity: existing.baseQuantity,
			baseUnit: existing.baseUnit,
		};
	}
	const nextBase = existingBase.baseQuantity + incomingBase.baseQuantity;
	return {
		quantity: nextBase,
		unit: existingBase.baseUnit,
		baseQuantity: nextBase,
		baseUnit: existingBase.baseUnit,
	};
}

async function runSupplyStatements(
	d1: ReturnType<typeof drizzle>,
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle statement types
	statements: any[],
) {
	for (const chunk of chunkArray(statements, 20)) {
		if (chunk.length === 0) continue;
		if (chunk.length === 1) {
			await chunk[0];
			continue;
		}
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
		await d1.batch(chunk as [any, ...any[]]);
	}
}

/**
 * Adds many jot lines at once. Matching name+domain rows gain quantity and
 * become unchecked so a repeat "milk" shows up to buy again. The source list
 * is otherwise left in place for the caller.
 */
export async function addSupplyItemsBulk(
	db: D1Database,
	organizationId: string,
	listId: string,
	items: Array<{
		name: string;
		quantity: number;
		unit: string;
		domain: string;
	}>,
): Promise<{ added: number; merged: number }> {
	if (items.length === 0) return { added: 0, merged: 0 };
	const list = await loadSupplyListRow(db, organizationId, listId);
	if (!list) throw new SupplyListNotFoundError();
	const state = resolveSupplyListState(list);
	if (!canMutateSupplyItems(state)) {
		throw new InvalidListStateError(state);
	}

	const d1 = drizzle(db);
	const existing = await loadItems(db, listId);
	const now = new Date();
	const byKey = new Map(
		existing.map((item) => [itemIdentity(item.name, item.domain), item]),
	);
	const inserts: ReturnType<typeof cloneSupplyItemValues>[] = [];
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch statement types
	const updates: any[] = [];
	let added = 0;
	let merged = 0;

	for (const item of items) {
		const key = itemIdentity(item.name, item.domain);
		const base = computeBaseFields(item.quantity, item.unit, item.name);
		const current = byKey.get(key);
		if (current) {
			const mergedQty = mergeSupplyItemQuantities(current, {
				name: item.name,
				quantity: item.quantity,
				unit: item.unit,
				baseQuantity: base.baseQuantity,
				baseUnit: base.baseUnit,
			});
			updates.push(
				d1
					.update(supplyItem)
					.set({
						quantity: mergedQty.quantity,
						unit: mergedQty.unit,
						baseQuantity: mergedQty.baseQuantity,
						baseUnit: mergedQty.baseUnit,
						isPurchased: false,
						updatedAt: now,
					})
					.where(eq(supplyItem.id, current.id)),
			);
			byKey.set(key, {
				...current,
				quantity: mergedQty.quantity,
				unit: mergedQty.unit,
				baseQuantity: mergedQty.baseQuantity,
				baseUnit: mergedQty.baseUnit,
				isPurchased: false,
			});
			merged += 1;
		} else {
			const row = {
				id: crypto.randomUUID(),
				listId,
				name: item.name,
				quantity: item.quantity,
				unit: item.unit,
				baseQuantity: base.baseQuantity,
				baseUnit: base.baseUnit,
				domain: item.domain,
				isPurchased: false,
				sourceMealId: null,
				sourceMealIds: [] as string[],
				sourceOrigins: ["manual"] as Array<
					"manual" | "manifest" | "galley" | "cargo"
				>,
				sourceCargoId: null,
				note: null,
				category: null,
				sortOrder: 0,
				updatedAt: now,
			};
			inserts.push(row);
			byKey.set(key, row as (typeof existing)[number]);
			added += 1;
		}
	}

	const limit = state === "live" ? 10_000 : SUPPLY_SAVED_ITEM_LIMIT;
	if (existing.length + inserts.length > limit) {
		throw new SupplyItemLimitError(limit);
	}

	const statements = [
		...updates,
		...chunkArray(inserts, D1_MAX_SUPPLY_ROWS_PER_STATEMENT).map((chunk) =>
			d1.insert(supplyItem).values(chunk),
		),
		d1
			.update(supplyList)
			.set({
				updatedAt: now,
				revision: (list.revision ?? 0) + 1,
			})
			.where(eq(supplyList.id, listId)),
	];
	await runSupplyStatements(d1, statements);
	return { added, merged };
}

export async function copyItemsToLive(options: {
	env: Env;
	organizationId: string;
	sourceListId: string;
	mode: "missing_only" | "add_all";
	itemIds?: string[];
}) {
	const source = await loadSupplyListRow(
		options.env.DB,
		options.organizationId,
		options.sourceListId,
	);
	if (!source) throw new SupplyListNotFoundError();
	const live = await ensureLiveSupplyList(
		options.env.DB,
		options.organizationId,
	);
	if (!live) throw new SupplyListNotFoundError();

	const sourceItems = await loadItems(options.env.DB, source.id);
	const selected = options.itemIds
		? sourceItems.filter((item) => options.itemIds?.includes(item.id))
		: sourceItems;
	const liveItems = live.items;
	const liveByKey = new Map(
		liveItems.map((item) => [itemIdentity(item.name, item.domain), item]),
	);

	const cargoByKey = new Map<string, number>();
	if (options.mode === "missing_only") {
		const cargo = await fetchOrgCargoIndex(
			options.env.DB,
			options.organizationId,
		);
		for (const row of cargo) {
			const key = itemIdentity(row.name, row.domain);
			cargoByKey.set(
				key,
				(cargoByKey.get(key) ?? 0) + (row.baseQuantity ?? row.quantity),
			);
		}
	}

	const d1 = drizzle(options.env.DB);
	const now = new Date();
	const inserts: ReturnType<typeof cloneSupplyItemValues>[] = [];
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch statement types
	const updates: any[] = [];

	for (const item of selected) {
		const key = itemIdentity(item.name, item.domain);
		if (options.mode === "missing_only") {
			const cargoQty = cargoByKey.get(key) ?? 0;
			const liveQty = liveByKey.get(key)?.baseQuantity ?? 0;
			if (cargoQty + liveQty >= (item.baseQuantity || item.quantity)) continue;
		}
		const existing = liveByKey.get(key);
		if (existing) {
			const merged = mergeSupplyItemQuantities(existing, item);
			updates.push(
				d1
					.update(supplyItem)
					.set({
						...merged,
						updatedAt: now,
						note: existing.note ?? item.note,
						category: existing.category ?? item.category,
					})
					.where(eq(supplyItem.id, existing.id)),
			);
		} else {
			inserts.push(
				cloneSupplyItemValues({ ...item, isPurchased: false }, live.id, {
					resetPurchased: true,
				}),
			);
		}
	}

	if (liveItems.length + inserts.length > 10_000) {
		throw new SupplyItemLimitError(10_000);
	}

	const statements = [
		...updates,
		...chunkArray(inserts, D1_MAX_SUPPLY_ROWS_PER_STATEMENT).map((chunk) =>
			d1.insert(supplyItem).values(chunk),
		),
		d1
			.update(supplyList)
			.set({
				updatedAt: now,
				revision: (live.revision ?? 0) + 1,
			})
			.where(eq(supplyList.id, live.id)),
	];
	if (statements.length > 0) {
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
		await d1.batch(statements as [any, ...any[]]);
	}
	return getSupplyListById(options.env.DB, options.organizationId, live.id);
}

export async function transferSupplyItems(options: {
	env: Env;
	organizationId: string;
	sourceListId: string;
	targetListId: string;
	itemIds: string[];
	mode: "copy" | "move";
}) {
	if (options.sourceListId === options.targetListId) {
		throw new InvalidListStateError("saved", "Choose a different target list.");
	}
	const source = await loadSupplyListRow(
		options.env.DB,
		options.organizationId,
		options.sourceListId,
	);
	const target = await loadSupplyListRow(
		options.env.DB,
		options.organizationId,
		options.targetListId,
	);
	if (!source || !target) throw new SupplyListNotFoundError();
	const sourceState = resolveSupplyListState(source);
	const targetState = resolveSupplyListState(target);
	if (options.mode === "move" && !canMutateSupplyItems(sourceState)) {
		throw new InvalidListStateError(sourceState);
	}
	if (!canMutateSupplyItems(targetState) && targetState !== "live") {
		throw new InvalidListStateError(targetState);
	}

	const d1 = drizzle(options.env.DB);
	const rows = await d1
		.select()
		.from(supplyItem)
		.where(
			and(
				eq(supplyItem.listId, options.sourceListId),
				inArray(supplyItem.id, options.itemIds),
			),
		);
	const targetItems = await loadItems(options.env.DB, target.id);
	if (
		targetState !== "live" &&
		targetItems.length + rows.length > SUPPLY_SAVED_ITEM_LIMIT
	) {
		throw new SupplyItemLimitError(SUPPLY_SAVED_ITEM_LIMIT);
	}

	const targetByKey = new Map(
		targetItems.map((item) => [itemIdentity(item.name, item.domain), item]),
	);
	const now = new Date();
	const inserts: ReturnType<typeof cloneSupplyItemValues>[] = [];
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch statement types
	const updates: any[] = [];
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch statement types
	const deletes: any[] = [];

	for (const item of rows) {
		const existing = targetByKey.get(itemIdentity(item.name, item.domain));
		if (existing) {
			const merged = mergeSupplyItemQuantities(existing, item);
			updates.push(
				d1
					.update(supplyItem)
					.set({ ...merged, updatedAt: now })
					.where(eq(supplyItem.id, existing.id)),
			);
		} else {
			inserts.push(
				cloneSupplyItemValues(item, target.id, { resetPurchased: false }),
			);
		}
		if (options.mode === "move") {
			deletes.push(d1.delete(supplyItem).where(eq(supplyItem.id, item.id)));
		}
	}

	const statements = [
		...updates,
		...chunkArray(inserts, D1_MAX_SUPPLY_ROWS_PER_STATEMENT).map((chunk) =>
			d1.insert(supplyItem).values(chunk),
		),
		...deletes,
		d1
			.update(supplyList)
			.set({
				updatedAt: now,
				revision: (target.revision ?? 0) + 1,
			})
			.where(eq(supplyList.id, target.id)),
		d1
			.update(supplyList)
			.set({
				updatedAt: now,
				revision: (source.revision ?? 0) + 1,
			})
			.where(eq(supplyList.id, source.id)),
	];
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await d1.batch(statements as [any, ...any[]]);
	return {
		source: await getSupplyListById(
			options.env.DB,
			options.organizationId,
			source.id,
		),
		target: await getSupplyListById(
			options.env.DB,
			options.organizationId,
			target.id,
		),
	};
}

export async function createSupplyListFromReceipt(options: {
	env: Env;
	organizationId: string;
	scanRequestId: string;
	name: string;
	items: Array<{
		name: string;
		quantity: number;
		unit: string;
		domain: string;
		category?: string;
		note?: string;
	}>;
	clientKey?: string;
}) {
	const job = await getQueueJob(options.env.DB, options.scanRequestId);
	if (!job || job.organizationId !== options.organizationId) {
		throw new SupplyListNotFoundError("Scan result not found");
	}

	const existing = await findBySourceReference(
		options.env.DB,
		options.organizationId,
		"receipt",
		options.scanRequestId,
	);
	if (existing) {
		return getSupplyListById(
			options.env.DB,
			options.organizationId,
			existing.id,
		);
	}

	if (options.items.length > SUPPLY_SAVED_ITEM_LIMIT) {
		throw new SupplyItemLimitError(SUPPLY_SAVED_ITEM_LIMIT);
	}

	const listId = crypto.randomUUID();
	try {
		await insertSupplyListWithQuota({
			env: options.env,
			organizationId: options.organizationId,
			values: {
				id: listId,
				name: options.name,
				kind: "saved",
				createdFrom: "receipt",
				sourceReference: options.scanRequestId,
			},
		});
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			const raced = await findBySourceReference(
				options.env.DB,
				options.organizationId,
				"receipt",
				options.scanRequestId,
			);
			if (raced) {
				return getSupplyListById(
					options.env.DB,
					options.organizationId,
					raced.id,
				);
			}
		}
		throw error;
	}

	const now = new Date();
	const rows = options.items.map((item, index) => {
		const base = computeBaseFields(item.quantity, item.unit, item.name);
		return {
			id: crypto.randomUUID(),
			listId,
			name: item.name,
			quantity: item.quantity,
			unit: item.unit,
			baseQuantity: base.baseQuantity,
			baseUnit: base.baseUnit,
			domain: item.domain,
			isPurchased: false,
			sourceMealId: null,
			sourceMealIds: [] as string[],
			sourceOrigins: ["manual"] as Array<"manual">,
			sourceCargoId: null,
			note: item.note ?? null,
			category: item.category ?? inferSupplyCategory({ domain: item.domain }),
			sortOrder: index,
			updatedAt: now,
		};
	});
	const d1 = drizzle(options.env.DB);
	await insertItemChunks(d1, rows);
	return getSupplyListById(options.env.DB, options.organizationId, listId);
}

export async function createCompletedTripSnapshot(options: {
	env: Env;
	organizationId: string;
	listId: string;
	name?: string;
}) {
	const source = await loadSupplyListRow(
		options.env.DB,
		options.organizationId,
		options.listId,
	);
	if (!source) throw new SupplyListNotFoundError();
	if (!canShopSupplyList(resolveSupplyListState(source))) {
		throw new InvalidListStateError(resolveSupplyListState(source));
	}
	const items = (await loadItems(options.env.DB, source.id)).filter(
		(item) => item.isPurchased,
	);
	const listId = crypto.randomUUID();
	const sourceReference = `trip:${source.id}:${source.revision}`;
	const existing = await findBySourceReference(
		options.env.DB,
		options.organizationId,
		"completed_trip",
		sourceReference,
	);
	if (existing) {
		return getSupplyListById(
			options.env.DB,
			options.organizationId,
			existing.id,
		);
	}

	try {
		await insertSupplyListWithQuota({
			env: options.env,
			organizationId: options.organizationId,
			values: {
				id: listId,
				name: options.name ?? `${source.name} trip`,
				kind: "saved",
				createdFrom: "completed_trip",
				sourceListId: source.id,
				sourceReference,
			},
		});
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			const raced = await findBySourceReference(
				options.env.DB,
				options.organizationId,
				"completed_trip",
				sourceReference,
			);
			if (raced) {
				return getSupplyListById(
					options.env.DB,
					options.organizationId,
					raced.id,
				);
			}
		}
		throw error;
	}

	const d1 = drizzle(options.env.DB);
	await d1
		.update(supplyList)
		.set({ archivedAt: new Date(), updatedAt: new Date() })
		.where(eq(supplyList.id, listId));
	await insertItemChunks(
		d1,
		items
			.slice(0, SUPPLY_SAVED_ITEM_LIMIT)
			.map((item) => cloneSupplyItemValues(item, listId)),
	);
	return getSupplyListById(options.env.DB, options.organizationId, listId);
}

export async function listSupplyStaples(
	db: D1Database,
	organizationId: string,
) {
	const d1 = drizzle(db);
	return d1
		.select()
		.from(supplyStaple)
		.where(eq(supplyStaple.organizationId, organizationId));
}

export async function upsertSupplyStaple(
	db: D1Database,
	organizationId: string,
	input: {
		name: string;
		quantity: number;
		unit: string;
		domain: string;
		category?: string;
		note?: string;
	},
) {
	const d1 = drizzle(db);
	const normalizedName = normalizeForCargoDedup(input.name);
	const base = computeBaseFields(input.quantity, input.unit, input.name);
	const now = new Date();
	try {
		await d1.insert(supplyStaple).values({
			id: crypto.randomUUID(),
			organizationId,
			name: input.name,
			normalizedName,
			quantity: input.quantity,
			unit: input.unit,
			baseQuantity: base.baseQuantity,
			baseUnit: base.baseUnit,
			domain: input.domain,
			category: input.category ?? inferSupplyCategory({ domain: input.domain }),
			note: input.note ?? null,
			createdAt: now,
			updatedAt: now,
		});
	} catch (error) {
		if (!isUniqueConstraintError(error)) throw error;
		await d1
			.update(supplyStaple)
			.set({
				name: input.name,
				quantity: input.quantity,
				unit: input.unit,
				baseQuantity: base.baseQuantity,
				baseUnit: base.baseUnit,
				domain: input.domain,
				category:
					input.category ?? inferSupplyCategory({ domain: input.domain }),
				note: input.note ?? null,
				updatedAt: now,
			})
			.where(
				and(
					eq(supplyStaple.organizationId, organizationId),
					eq(supplyStaple.normalizedName, normalizedName),
					eq(supplyStaple.domain, input.domain),
				),
			);
	}
	const [row] = await d1
		.select()
		.from(supplyStaple)
		.where(
			and(
				eq(supplyStaple.organizationId, organizationId),
				eq(supplyStaple.normalizedName, normalizedName),
				eq(supplyStaple.domain, input.domain),
			),
		)
		.limit(1);
	return row;
}

export async function deleteSupplyStaple(
	db: D1Database,
	organizationId: string,
	stapleId: string,
) {
	const d1 = drizzle(db);
	await d1
		.delete(supplyStaple)
		.where(
			and(
				eq(supplyStaple.id, stapleId),
				eq(supplyStaple.organizationId, organizationId),
			),
		);
	return { deleted: true };
}

export async function addStaplesToList(options: {
	env: Env;
	organizationId: string;
	listId: string;
	stapleIds: string[];
}) {
	const list = await loadSupplyListRow(
		options.env.DB,
		options.organizationId,
		options.listId,
	);
	if (!list) throw new SupplyListNotFoundError();
	const state = resolveSupplyListState(list);
	if (!canMutateSupplyItems(state) && state !== "live") {
		throw new InvalidListStateError(state);
	}
	const d1 = drizzle(options.env.DB);
	const staples = await d1
		.select()
		.from(supplyStaple)
		.where(
			and(
				eq(supplyStaple.organizationId, options.organizationId),
				inArray(supplyStaple.id, options.stapleIds),
			),
		);
	const existing = await loadItems(options.env.DB, list.id);
	if (
		state !== "live" &&
		existing.length + staples.length > SUPPLY_SAVED_ITEM_LIMIT
	) {
		throw new SupplyItemLimitError(SUPPLY_SAVED_ITEM_LIMIT);
	}
	const now = new Date();
	const rows = staples.map((staple, index) => ({
		id: crypto.randomUUID(),
		listId: list.id,
		name: staple.name,
		quantity: staple.quantity,
		unit: staple.unit,
		baseQuantity: staple.baseQuantity,
		baseUnit: staple.baseUnit,
		domain: staple.domain,
		isPurchased: false,
		sourceMealId: null,
		sourceMealIds: [] as string[],
		sourceOrigins: ["manual"] as Array<"manual">,
		sourceCargoId: null,
		note: staple.note,
		category: staple.category,
		sortOrder: existing.length + index,
		updatedAt: now,
	}));
	await insertItemChunks(d1, rows);
	await d1
		.update(supplyList)
		.set({ updatedAt: now, revision: (list.revision ?? 0) + 1 })
		.where(eq(supplyList.id, list.id));
	return getSupplyListById(options.env.DB, options.organizationId, list.id);
}

export async function listSupplyStores(db: D1Database, organizationId: string) {
	const d1 = drizzle(db);
	const profiles = await d1
		.select()
		.from(supplyStoreProfile)
		.where(eq(supplyStoreProfile.organizationId, organizationId));
	if (profiles.length === 0) return [];
	const aisles = await d1
		.select()
		.from(supplyStoreAisle)
		.where(
			inArray(
				supplyStoreAisle.profileId,
				profiles.map((profile) => profile.id),
			),
		);
	return profiles.map((profile) => ({
		...profile,
		aisles: aisles
			.filter((aisle) => aisle.profileId === profile.id)
			.sort((a, b) => a.sortOrder - b.sortOrder),
	}));
}

export async function upsertSupplyStore(
	db: D1Database,
	organizationId: string,
	input: {
		id?: string;
		name: string;
		aisles?: Array<{ category: string; sortOrder: number }>;
	},
) {
	const d1 = drizzle(db);
	const normalizedName = input.name.trim().toLowerCase();
	const now = new Date();
	let profileId = input.id;
	if (profileId) {
		const [existing] = await d1
			.select()
			.from(supplyStoreProfile)
			.where(
				and(
					eq(supplyStoreProfile.id, profileId),
					eq(supplyStoreProfile.organizationId, organizationId),
				),
			)
			.limit(1);
		if (!existing) throw new SupplyListNotFoundError("Store profile not found");
		await d1
			.update(supplyStoreProfile)
			.set({ name: input.name, normalizedName, updatedAt: now })
			.where(eq(supplyStoreProfile.id, profileId));
	} else {
		profileId = crypto.randomUUID();
		await d1.insert(supplyStoreProfile).values({
			id: profileId,
			organizationId,
			name: input.name,
			normalizedName,
			createdAt: now,
			updatedAt: now,
		});
	}
	if (input.aisles) {
		await d1
			.delete(supplyStoreAisle)
			.where(eq(supplyStoreAisle.profileId, profileId));
		if (input.aisles.length > 0) {
			await d1.insert(supplyStoreAisle).values(
				input.aisles.map((aisle) => ({
					id: crypto.randomUUID(),
					profileId: profileId as string,
					category: aisle.category,
					sortOrder: aisle.sortOrder,
				})),
			);
		}
	}
	const stores = await listSupplyStores(db, organizationId);
	return stores.find((store) => store.id === profileId) ?? null;
}

export async function deleteSupplyStore(
	db: D1Database,
	organizationId: string,
	profileId: string,
) {
	const d1 = drizzle(db);
	await d1
		.delete(supplyStoreProfile)
		.where(
			and(
				eq(supplyStoreProfile.id, profileId),
				eq(supplyStoreProfile.organizationId, organizationId),
			),
		);
	return { deleted: true };
}

export async function assignStoreToList(
	db: D1Database,
	organizationId: string,
	listId: string,
	storeProfileId: string | null,
) {
	const list = await loadSupplyListRow(db, organizationId, listId);
	if (!list) throw new SupplyListNotFoundError();
	const d1 = drizzle(db);
	await d1
		.update(supplyList)
		.set({
			storeProfileId,
			updatedAt: new Date(),
			revision: (list.revision ?? 0) + 1,
		})
		.where(eq(supplyList.id, listId));
	return getSupplyListById(db, organizationId, listId);
}

export async function applySupplyOperations(options: {
	env: Env;
	organizationId: string;
	listId: string;
	baseRevision: number;
	operations: Array<{
		operationId: string;
		type:
			| "add_item"
			| "update_item"
			| "delete_item"
			| "toggle_purchased"
			| "reset_purchased";
		itemId?: string;
		payload?: {
			name?: string;
			quantity?: number;
			unit?: string;
			domain?: string;
			note?: string | null;
			category?: string | null;
			isPurchased?: boolean;
			sortOrder?: number;
		};
	}>;
}) {
	const list = await loadSupplyListRow(
		options.env.DB,
		options.organizationId,
		options.listId,
	);
	if (!list) throw new SupplyListNotFoundError();
	const state = resolveSupplyListState(list);
	if (!canMutateSupplyItems(state) && state !== "live") {
		throw new InvalidListStateError(state);
	}

	const d1 = drizzle(options.env.DB);
	const existingOps = await d1
		.select()
		.from(supplyOperation)
		.where(
			and(
				eq(supplyOperation.organizationId, options.organizationId),
				inArray(
					supplyOperation.operationId,
					options.operations.map((op) => op.operationId),
				),
			),
		);
	const existingById = new Map(
		existingOps.map((row) => [row.operationId, row]),
	);

	const structural = options.operations.some(
		(op) =>
			op.type === "add_item" ||
			op.type === "update_item" ||
			op.type === "delete_item" ||
			op.type === "reset_purchased",
	);
	if (structural && options.baseRevision < (list.revision ?? 0)) {
		throw new InvalidListStateError(
			state,
			"List changed — refresh before applying offline edits.",
		);
	}

	const results: Array<{
		operationId: string;
		status: "applied" | "duplicate";
		result: unknown;
	}> = [];

	for (const operation of options.operations) {
		const prior = existingById.get(operation.operationId);
		if (prior) {
			results.push({
				operationId: operation.operationId,
				status: "duplicate",
				result: prior.resultJson ? JSON.parse(prior.resultJson) : null,
			});
			continue;
		}

		let result: unknown = { ok: true };
		if (operation.type === "add_item" && operation.payload?.name) {
			const { addSupplyItem } = await import("./supply.server");
			result = await addSupplyItem(
				options.env.DB,
				options.organizationId,
				options.listId,
				{
					name: operation.payload.name,
					quantity: operation.payload.quantity,
					unit: operation.payload.unit,
					domain: operation.payload.domain,
					note: operation.payload.note,
					category: operation.payload.category ?? undefined,
					sortOrder: operation.payload.sortOrder,
				},
			);
		} else if (operation.type === "update_item" && operation.itemId) {
			const { updateSupplyItem } = await import("./supply.server");
			result = await updateSupplyItem(
				options.env.DB,
				options.organizationId,
				options.listId,
				operation.itemId,
				operation.payload ?? {},
			);
		} else if (operation.type === "delete_item" && operation.itemId) {
			const { deleteSupplyItem } = await import("./supply.server");
			result = await deleteSupplyItem(
				options.env.DB,
				options.organizationId,
				options.listId,
				operation.itemId,
			);
		} else if (operation.type === "toggle_purchased" && operation.itemId) {
			const { updateSupplyItem } = await import("./supply.server");
			result = await updateSupplyItem(
				options.env.DB,
				options.organizationId,
				options.listId,
				operation.itemId,
				{ isPurchased: operation.payload?.isPurchased ?? true },
			);
		} else if (operation.type === "reset_purchased") {
			result = await resetPurchasedSupplyItems(
				options.env.DB,
				options.organizationId,
				options.listId,
			);
		}

		await d1.insert(supplyOperation).values({
			id: crypto.randomUUID(),
			organizationId: options.organizationId,
			listId: options.listId,
			operationId: operation.operationId,
			operationType: operation.type,
			appliedAt: new Date(),
			resultJson: JSON.stringify(result),
		});
		results.push({
			operationId: operation.operationId,
			status: "applied",
			result,
		});
	}

	const latest = await loadSupplyListRow(
		options.env.DB,
		options.organizationId,
		options.listId,
	);
	return {
		revision: latest?.revision ?? list.revision,
		etag: supplyListEtag(latest?.revision ?? list.revision),
		results,
	};
}

export function supplyListResponseHeaders(revision: number) {
	return {
		ETag: supplyListEtag(revision),
	};
}
