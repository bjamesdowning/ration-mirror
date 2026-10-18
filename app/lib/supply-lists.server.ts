import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
	kitchenEvent,
	supplyItem,
	supplyList,
	supplyOperation,
	supplyStaple,
	supplyStoreAisle,
	supplyStoreProfile,
} from "~/db/schema";
import { computeBaseFields, effectiveBaseFields } from "./base-quantity";
import { checkCapacity } from "./capacity.server";
import { type CargoIndexRow, fetchOrgCargoIndex } from "./cargo-index.server";
import { normalizeForCargoDedup } from "./matching.server";
import {
	chunkArray,
	D1_MAX_SUPPLY_ROWS_PER_STATEMENT,
} from "./query-utils.server";
import { getQueueJob } from "./queue-job.server";
import { ensureLiveSupplyList, getSupplyListById } from "./supply.server";
import { inferSupplyCategory } from "./supply-categories";
import {
	isManualOnlySupplyItem,
	normalizeSupplyOrigins,
} from "./supply-item-origins";
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
	canAddToLive,
	canArchiveSupplyList,
	canMutateSupplyItems,
	canResetPurchasedSupplyList,
	canShopSupplyList,
	isUniqueConstraintError,
	LIVE_ONLY_CHECK_MESSAGE,
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
	if (!canResetPurchasedSupplyList(state)) {
		throw new InvalidListStateError(state, LIVE_ONLY_CHECK_MESSAGE);
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

export type SupplyAddToLiveSkipReason = "on_live" | "in_cart" | "in_cargo";

export type SupplyAddToLiveResult = {
	added: Array<{ sourceItemId: string; liveItemId: string }>;
	merged: Array<{
		sourceItemId: string;
		liveItemId: string;
		prevQuantity: number;
		prevUnit: string;
		quantity: number;
		unit: string;
	}>;
	skipped: Array<{
		sourceItemId: string;
		reason: SupplyAddToLiveSkipReason;
	}>;
	counts: {
		added: number;
		merged: number;
		skippedOnLive: number;
		skippedInCart: number;
		skippedInCargo: number;
	};
};

export type SavedListLiveStatus =
	| { state: "none" }
	| {
			state: "on_live" | "in_cart";
			quantity: number;
			unit: string;
			manualOnly: boolean;
			liveItemId: string;
	  };

type LoadedSupplyList = NonNullable<
	Awaited<ReturnType<typeof getSupplyListById>>
>;

export type SavedListView = Omit<LoadedSupplyList, "items"> & {
	items: Array<
		LoadedSupplyList["items"][number] & {
			live?: SavedListLiveStatus;
			inCargo?: number;
			lastDockedAt?: string | null;
		}
	>;
};

const LAST_BOUGHT_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

function emptyAddToLiveResult(): SupplyAddToLiveResult {
	return {
		added: [],
		merged: [],
		skipped: [],
		counts: {
			added: 0,
			merged: 0,
			skippedOnLive: 0,
			skippedInCart: 0,
			skippedInCargo: 0,
		},
	};
}

function pushSkip(
	result: SupplyAddToLiveResult,
	sourceItemId: string,
	reason: SupplyAddToLiveSkipReason,
) {
	result.skipped.push({ sourceItemId, reason });
	if (reason === "on_live") result.counts.skippedOnLive += 1;
	else if (reason === "in_cart") result.counts.skippedInCart += 1;
	else result.counts.skippedInCargo += 1;
}

function groupLiveItems(items: SupplyItemRow[]) {
	const byKey = new Map<string, SupplyItemRow[]>();
	for (const item of items) {
		const key = itemIdentity(item.name, item.domain);
		const group = byKey.get(key);
		if (group) group.push(item);
		else byKey.set(key, [item]);
	}
	return byKey;
}

export function liveStatusForItems(rows: SupplyItemRow[]): SavedListLiveStatus {
	const unpurchased = rows.filter((row) => !row.isPurchased);
	if (unpurchased.length > 0) {
		const manual = unpurchased.find((row) => isManualOnlySupplyItem(row));
		const primary = manual ?? unpurchased[0];
		const sameUnit = unpurchased.every((row) => row.unit === primary.unit);
		const quantity = sameUnit
			? unpurchased.reduce((sum, row) => sum + row.quantity, 0)
			: primary.quantity;
		return {
			state: "on_live",
			quantity,
			unit: primary.unit,
			manualOnly: Boolean(manual),
			liveItemId: primary.id,
		};
	}
	const purchased = rows.filter((row) => row.isPurchased);
	if (purchased.length > 0) {
		const primary = purchased[0];
		return {
			state: "in_cart",
			quantity: primary.quantity,
			unit: primary.unit,
			manualOnly: isManualOnlySupplyItem(primary),
			liveItemId: primary.id,
		};
	}
	return { state: "none" };
}

function cargoTotals(rows: CargoIndexRow[]) {
	const map = new Map<string, { base: number; quantity: number }>();
	for (const row of rows) {
		const key = itemIdentity(row.name, row.domain || "food");
		const current = map.get(key) ?? { base: 0, quantity: 0 };
		current.base += row.baseQuantity ?? row.quantity;
		current.quantity += row.quantity;
		map.set(key, current);
	}
	return map;
}

function manualLiveInsert(item: SupplyItemRow, liveListId: string, now: Date) {
	const base = computeBaseFields(item.quantity, item.unit, item.name);
	return {
		id: crypto.randomUUID(),
		listId: liveListId,
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
		note: item.note,
		category: item.category,
		sortOrder: item.sortOrder,
		createdAt: now,
		updatedAt: now,
	};
}

function eventTime(value: unknown): Date | null {
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
	if (typeof value === "number" && Number.isFinite(value)) {
		return new Date(value < 1e12 ? value * 1000 : value);
	}
	if (typeof value === "string") {
		const parsed = Date.parse(value);
		if (Number.isFinite(parsed)) return new Date(parsed);
		const asNumber = Number(value);
		if (Number.isFinite(asNumber)) return eventTime(asNumber);
	}
	return null;
}

async function readAddToLiveReplay(
	db: D1Database,
	organizationId: string,
	clientKey: string,
): Promise<SupplyAddToLiveResult | null> {
	const d1 = drizzle(db);
	const [row] = await d1
		.select()
		.from(supplyOperation)
		.where(
			and(
				eq(supplyOperation.organizationId, organizationId),
				eq(supplyOperation.operationId, clientKey),
				eq(supplyOperation.operationType, "add_to_live"),
			),
		)
		.limit(1);
	if (!row?.resultJson) return null;
	try {
		return JSON.parse(row.resultJson) as SupplyAddToLiveResult;
	} catch {
		return null;
	}
}

export async function copyItemsToLive(options: {
	env: Env;
	organizationId: string;
	sourceListId: string;
	mode: "missing_only" | "add_all";
	onExisting?: "skip" | "add_more";
	itemIds?: string[];
	clientKey?: string;
}) {
	const source = await loadSupplyListRow(
		options.env.DB,
		options.organizationId,
		options.sourceListId,
	);
	if (!source) throw new SupplyListNotFoundError();
	const sourceState = resolveSupplyListState(source);
	if (!canAddToLive(sourceState)) {
		throw new InvalidListStateError(
			sourceState,
			"Add items to Live from a saved list.",
		);
	}
	const live = await ensureLiveSupplyList(
		options.env.DB,
		options.organizationId,
	);
	if (!live) throw new SupplyListNotFoundError();

	if (options.clientKey) {
		const replay = await readAddToLiveReplay(
			options.env.DB,
			options.organizationId,
			options.clientKey,
		);
		if (replay) {
			const list = await getSupplyListById(
				options.env.DB,
				options.organizationId,
				live.id,
			);
			return { list, result: replay };
		}
	}

	const sourceItems = await loadItems(options.env.DB, source.id);
	const selected = options.itemIds
		? sourceItems.filter((item) => options.itemIds?.includes(item.id))
		: sourceItems;
	const onExisting = options.onExisting ?? "skip";
	const explicitItems = options.itemIds != null;
	const liveByKey = groupLiveItems(live.items);
	const skipCargo =
		options.mode === "missing_only" &&
		!explicitItems &&
		onExisting !== "add_more";
	const cargoByKey = skipCargo
		? cargoTotals(
				await fetchOrgCargoIndex(options.env.DB, options.organizationId),
			)
		: new Map<string, { base: number; quantity: number }>();

	const d1 = drizzle(options.env.DB);
	const now = new Date();
	const inserts: ReturnType<typeof manualLiveInsert>[] = [];
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch statement types
	const updates: any[] = [];
	const result = emptyAddToLiveResult();

	for (const item of selected) {
		const key = itemIdentity(item.name, item.domain);
		const group = liveByKey.get(key) ?? [];
		const status = liveStatusForItems(group);
		if (status.state === "on_live" || status.state === "in_cart") {
			if (onExisting !== "add_more") {
				pushSkip(result, item.id, status.state);
				continue;
			}
			const manual = group.find(
				(row) => !row.isPurchased && isManualOnlySupplyItem(row),
			);
			if (status.state === "on_live" && manual) {
				const prevQuantity = manual.quantity;
				const prevUnit = manual.unit;
				const merged = mergeSupplyItemQuantities(manual, item);
				updates.push(
					d1
						.update(supplyItem)
						.set({ ...merged, updatedAt: now })
						.where(eq(supplyItem.id, manual.id)),
				);
				manual.quantity = merged.quantity;
				manual.unit = merged.unit;
				manual.baseQuantity = merged.baseQuantity;
				manual.baseUnit = merged.baseUnit;
				result.merged.push({
					sourceItemId: item.id,
					liveItemId: manual.id,
					prevQuantity,
					prevUnit,
					quantity: merged.quantity,
					unit: merged.unit,
				});
				result.counts.merged += 1;
				continue;
			}
		} else if (skipCargo) {
			const needed = item.baseQuantity || item.quantity;
			const cargoBase = cargoByKey.get(key)?.base ?? 0;
			if (needed > 0 && cargoBase >= needed) {
				pushSkip(result, item.id, "in_cargo");
				continue;
			}
		}

		const inserted = manualLiveInsert(item, live.id, now);
		inserts.push(inserted);
		group.push(inserted as unknown as SupplyItemRow);
		liveByKey.set(key, group);
		result.added.push({ sourceItemId: item.id, liveItemId: inserted.id });
		result.counts.added += 1;
	}

	if (live.items.length + inserts.length > 10_000) {
		throw new SupplyItemLimitError(10_000);
	}

	if (selected.length > 0) {
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
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
		await d1.batch(statements as [any, ...any[]]);
	}

	if (options.clientKey) {
		await d1
			.insert(supplyOperation)
			.values({
				id: crypto.randomUUID(),
				organizationId: options.organizationId,
				listId: source.id,
				operationId: options.clientKey,
				operationType: "add_to_live",
				appliedAt: now,
				resultJson: JSON.stringify(result),
			})
			.onConflictDoNothing();
	}

	const list = await getSupplyListById(
		options.env.DB,
		options.organizationId,
		live.id,
	);
	return { list, result };
}

export async function undoAddToLive(options: {
	env: Env;
	organizationId: string;
	sourceListId: string;
	added: Array<{ liveItemId: string }>;
	merged: Array<{
		liveItemId: string;
		prevQuantity: number;
		prevUnit: string;
		quantity?: number;
	}>;
}) {
	const source = await loadSupplyListRow(
		options.env.DB,
		options.organizationId,
		options.sourceListId,
	);
	if (!source) throw new SupplyListNotFoundError();
	const sourceState = resolveSupplyListState(source);
	if (!canAddToLive(sourceState)) {
		throw new InvalidListStateError(sourceState);
	}
	const live = await ensureLiveSupplyList(
		options.env.DB,
		options.organizationId,
	);
	if (!live) throw new SupplyListNotFoundError();

	const d1 = drizzle(options.env.DB);
	const liveItems = await loadItems(options.env.DB, live.id);
	const byId = new Map(liveItems.map((item) => [item.id, item]));
	const now = new Date();
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch statement types
	const deletes: any[] = [];
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch statement types
	const updates: any[] = [];
	let deleted = 0;
	let restored = 0;

	for (const row of options.added) {
		const item = byId.get(row.liveItemId);
		if (!item || item.isPurchased || !isManualOnlySupplyItem(item)) continue;
		deletes.push(d1.delete(supplyItem).where(eq(supplyItem.id, item.id)));
		deleted += 1;
	}
	for (const row of options.merged) {
		const item = byId.get(row.liveItemId);
		if (!item || item.isPurchased || !isManualOnlySupplyItem(item)) continue;
		if (
			row.quantity !== undefined &&
			Math.abs(item.quantity - row.quantity) > 1e-6
		) {
			continue;
		}
		const base = computeBaseFields(row.prevQuantity, row.prevUnit, item.name);
		updates.push(
			d1
				.update(supplyItem)
				.set({
					quantity: row.prevQuantity,
					unit: row.prevUnit,
					baseQuantity: base.baseQuantity,
					baseUnit: base.baseUnit,
					updatedAt: now,
				})
				.where(eq(supplyItem.id, item.id)),
		);
		restored += 1;
	}

	if (deletes.length + updates.length > 0) {
		const statements = [
			...deletes,
			...updates,
			d1
				.update(supplyList)
				.set({
					updatedAt: now,
					revision: (live.revision ?? 0) + 1,
				})
				.where(eq(supplyList.id, live.id)),
		];
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
		await d1.batch(statements as [any, ...any[]]);
	}

	return {
		list: await getSupplyListById(
			options.env.DB,
			options.organizationId,
			live.id,
		),
		undone: { deleted, restored },
	};
}

export async function lastDockedAtByNormalizedName(
	db: D1Database,
	organizationId: string,
	names: string[],
	now = new Date(),
) {
	const wanted = new Set(
		names.map((name) => normalizeForCargoDedup(name)).filter((name) => name),
	);
	const queryNames = new Set<string>();
	for (const name of names) {
		const trimmed = name.trim().toLowerCase();
		if (trimmed) queryNames.add(trimmed);
		const normalized = normalizeForCargoDedup(name);
		if (normalized) queryNames.add(normalized);
	}
	const found = new Map<string, string>();
	if (wanted.size === 0 || queryNames.size === 0) return found;

	const cutoff = new Date(now.getTime() - LAST_BOUGHT_WINDOW_MS);
	const d1 = drizzle(db);
	for (const chunk of chunkArray([...queryNames], 90)) {
		if (chunk.length === 0) continue;
		const rows = await d1
			.select({
				subjectName: kitchenEvent.subjectName,
				occurredAt: sql<number>`max(${kitchenEvent.occurredAt})`,
			})
			.from(kitchenEvent)
			.where(
				and(
					eq(kitchenEvent.organizationId, organizationId),
					eq(kitchenEvent.eventType, "supply_docked"),
					gte(kitchenEvent.occurredAt, cutoff),
					sql`lower(${kitchenEvent.subjectName}) in (${sql.join(
						chunk.map((name) => sql`${name}`),
						sql`, `,
					)})`,
				),
			)
			.groupBy(sql`lower(${kitchenEvent.subjectName})`);
		for (const row of rows) {
			const key = normalizeForCargoDedup(row.subjectName);
			if (!wanted.has(key)) continue;
			const at = eventTime(row.occurredAt);
			if (!at) continue;
			const iso = at.toISOString();
			const prev = found.get(key);
			if (!prev || iso > prev) found.set(key, iso);
		}
	}
	return found;
}

export async function getSavedListView(
	env: Env,
	organizationId: string,
	listId: string,
	now = new Date(),
): Promise<SavedListView | null> {
	const list = await getSupplyListById(env.DB, organizationId, listId);
	if (!list) return null;
	if (resolveSupplyListState(list) === "live") return list;

	const live = await ensureLiveSupplyList(env.DB, organizationId);
	const liveByKey = groupLiveItems(live?.items ?? []);
	const cargoByKey = cargoTotals(
		await fetchOrgCargoIndex(env.DB, organizationId),
	);
	const lastDocked = await lastDockedAtByNormalizedName(
		env.DB,
		organizationId,
		list.items.map((item) => item.name),
		now,
	);

	return {
		...list,
		items: list.items.map((item) => {
			const key = itemIdentity(item.name, item.domain);
			return {
				...item,
				live: liveStatusForItems(liveByKey.get(key) ?? []),
				inCargo: cargoByKey.get(key)?.quantity ?? 0,
				lastDockedAt: lastDocked.get(normalizeForCargoDedup(item.name)) ?? null,
			};
		}),
	};
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
	if (!canMutateSupplyItems(state)) {
		throw new InvalidListStateError(state);
	}
	const checksOffLive = options.operations.some(
		(op) =>
			op.type === "toggle_purchased" ||
			op.type === "reset_purchased" ||
			(op.type === "update_item" && op.payload?.isPurchased !== undefined),
	);
	if (checksOffLive && !canShopSupplyList(state)) {
		throw new InvalidListStateError(state, LIVE_ONLY_CHECK_MESSAGE);
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
