import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { supplyItem } from "../db/schema";
import { CapacityExceededError } from "./capacity.server";
import { ITEM_DOMAINS } from "./domain";
import { convertForIngredient } from "./present-quantity";
import { getQueueJob } from "./queue-job.server";
import { parseJobResultJson } from "./queue-status-loader.server";
import type { ScanResultItem } from "./schemas/scan";
import type { SupplyScanCompleteRequest } from "./schemas/supply-scan";
import {
	completeSupplyFromScan,
	getSupplyListById,
	type SupplyItemWithSource,
	type SupplyListOperationOptions,
	type SupplyScanCompleteInput,
} from "./supply.server";
import {
	matchScanToSupply,
	SUPPLY_SCAN_FUZZY_THRESHOLD,
	scoreScanToSupplyItem,
} from "./supply-scan-match.server";
import { dedupeTagSlugs } from "./tags";
import {
	getUnitFamily,
	getUnitMultiplier,
	type SupportedUnit,
	toSupportedUnit,
} from "./units";

const SCAN_COMPLETE_IDEMPOTENCY_TTL = 86_400;
/** Max dock qty multiplier vs receipt line (after unit conversion). */
const MAX_QTY_MULTIPLIER = 10;
const MAX_ABSOLUTE_QTY = 10_000;

const PACKAGING_COUNT_FAMILIES = new Set([
	"count_unit",
	"count_can",
	"count_pack",
]);

function isPackagingCountUnit(unit: SupportedUnit): boolean {
	return PACKAGING_COUNT_FAMILIES.has(getUnitFamily(unit));
}

/**
 * Piece-equivalent for packaging anti-abuse.
 * count_unit uses base factors (dozen → 12); can/pack stay 1:1 opaque packages.
 */
function packagingPieceCount(quantity: number, unit: SupportedUnit): number {
	if (getUnitFamily(unit) === "count_unit") {
		const asUnit = getUnitMultiplier(unit, "unit");
		return quantity * (asUnit ?? 1);
	}
	return quantity;
}

type ScanJobResult = {
	status?: string;
	items?: ScanResultItem[];
};

export class SupplyScanError extends Error {
	constructor(
		message: string,
		readonly code:
			| "job_not_found"
			| "job_not_completed"
			| "list_not_found"
			| "invalid_pair"
			| "invalid_items",
	) {
		super(message);
		this.name = "SupplyScanError";
	}
}

function scanCompleteIdempotencyKey(
	organizationId: string,
	requestId: string,
): string {
	return `scan-complete:${organizationId}:${requestId}`;
}

async function assertScanJobReady(
	env: Env,
	organizationId: string,
	requestId: string,
): Promise<ScanResultItem[]> {
	const job = await getQueueJob(env.DB, requestId);
	if (!job || job.organizationId !== organizationId) {
		throw new SupplyScanError("Scan job not found", "job_not_found");
	}
	if (job.status !== "completed") {
		throw new SupplyScanError("Scan job not completed", "job_not_completed");
	}
	const parsed = parseJobResultJson<ScanJobResult>(job.resultJson);
	return parsed.items ?? [];
}

async function assertListOwned(
	db: D1Database,
	organizationId: string,
	listId: string,
) {
	const list = await getSupplyListById(db, organizationId, listId);
	if (!list) {
		throw new SupplyScanError("Supply list not found", "list_not_found");
	}
	return list;
}

export async function getSupplyScanMatch(
	env: Env,
	organizationId: string,
	listId: string,
	requestId: string,
) {
	const scanItems = await assertScanJobReady(env, organizationId, requestId);
	const list = await assertListOwned(env.DB, organizationId, listId);
	const match = matchScanToSupply(scanItems, list.items);
	return {
		requestId,
		scanItems,
		...match,
	};
}

/**
 * Constrains client dock quantity to anti-abuse caps.
 * Any unit may be corrected (OCR often emits "unit" for milk that should be "l").
 * Same-family / density conversions keep a 10× receipt bound; packaging-count
 * remaps use piece-equivalent caps; other free remaps use raw-qty 10× + absolute.
 */
export function sanitizeDockFromScanItem(
	scanItem: ScanResultItem,
	clientDock: SupplyScanCompleteRequest["pairs"][number]["dock"],
): SupplyScanCompleteInput["dock"] {
	const name = (clientDock.name ?? scanItem.name).trim().slice(0, 200);
	if (!name) {
		throw new SupplyScanError("Dock item name is required", "invalid_pair");
	}

	const scanUnit = toSupportedUnit(scanItem.unit);
	const clientUnit = toSupportedUnit(clientDock.unit);

	const toScanMultiplier = getUnitMultiplier(clientUnit, scanUnit);
	const densityConverted =
		toScanMultiplier == null
			? convertForIngredient(scanItem.quantity, scanUnit, clientUnit, name)
			: null;
	const packagingRemap =
		toScanMultiplier == null &&
		densityConverted == null &&
		isPackagingCountUnit(clientUnit) &&
		isPackagingCountUnit(scanUnit);

	let maxQty: number;
	if (toScanMultiplier != null) {
		const scanQtyInClientUnit = scanItem.quantity / toScanMultiplier;
		maxQty = Math.min(
			MAX_ABSOLUTE_QTY,
			Math.max(
				scanQtyInClientUnit * MAX_QTY_MULTIPLIER,
				scanQtyInClientUnit + 1,
			),
		);
	} else if (densityConverted != null) {
		maxQty = Math.min(
			MAX_ABSOLUTE_QTY,
			Math.max(densityConverted * MAX_QTY_MULTIPLIER, densityConverted + 1),
		);
	} else if (packagingRemap) {
		// Bound by piece-equivalent so 1 can ↛ 10 dozen (120 pieces).
		const scanPieces = packagingPieceCount(scanItem.quantity, scanUnit);
		const maxPieces = Math.min(
			MAX_ABSOLUTE_QTY,
			Math.max(scanPieces * MAX_QTY_MULTIPLIER, scanPieces + 1),
		);
		const clientPieceFactor = packagingPieceCount(1, clientUnit);
		maxQty = Math.min(
			MAX_ABSOLUTE_QTY,
			maxPieces / Math.max(clientPieceFactor, 1),
		);
	} else {
		// Free OCR remap (e.g. unit → l): bound by receipt count, not family.
		maxQty = Math.min(
			MAX_ABSOLUTE_QTY,
			Math.max(scanItem.quantity * MAX_QTY_MULTIPLIER, scanItem.quantity + 1),
		);
	}

	const quantityRaw = clientDock.quantity;
	if (!Number.isFinite(quantityRaw) || quantityRaw < 0) {
		throw new SupplyScanError(
			"Enter a valid quantity for each item before docking.",
			"invalid_pair",
		);
	}
	if (quantityRaw > maxQty) {
		throw new SupplyScanError(
			"That quantity is too high for this receipt line. Lower it and try again.",
			"invalid_pair",
		);
	}
	const quantity = quantityRaw;

	const domain = (ITEM_DOMAINS as readonly string[]).includes(clientDock.domain)
		? (clientDock.domain as (typeof ITEM_DOMAINS)[number])
		: scanItem.domain;

	const tags = dedupeTagSlugs(clientDock.tags ?? []);

	return {
		name,
		quantity,
		unit: clientUnit,
		domain,
		tags,
		expiresAt: clientDock.expiresAt ?? scanItem.expiresAt ?? undefined,
		mergeTargetId: clientDock.mergeTargetId,
		nutrition: clientDock.nutrition ?? undefined,
	};
}

/**
 * Validates and sanitizes scan-complete pairs against the job result and list.
 * Exported for unit tests.
 */
export function buildSanitizedScanCompleteInputs(
	pairs: SupplyScanCompleteRequest["pairs"],
	scanItems: ScanResultItem[],
	supplyItems: SupplyItemWithSource[],
): SupplyScanCompleteInput[] {
	const scanById = new Map(scanItems.map((item) => [item.id, item]));
	const supplyById = new Map(supplyItems.map((item) => [item.id, item]));

	return pairs.map((pair) => {
		const scanItem = scanById.get(pair.scanItemId);
		if (!scanItem) {
			throw new SupplyScanError("Invalid scan item in pair", "invalid_pair");
		}

		let supplyItem: SupplyItemWithSource | undefined;
		if (pair.supplyItemId) {
			supplyItem = supplyById.get(pair.supplyItemId);
			if (!supplyItem) {
				throw new SupplyScanError(
					"Invalid supply item in pair",
					"invalid_pair",
				);
			}
			if (pair.matchType !== "manual") {
				const score = scoreScanToSupplyItem(scanItem, supplyItem);
				if (score < SUPPLY_SCAN_FUZZY_THRESHOLD) {
					throw new SupplyScanError(
						"Supply pairing below match threshold",
						"invalid_pair",
					);
				}
			}
		}

		const dock = sanitizeDockFromScanItem(scanItem, pair.dock);

		let updateSupply: SupplyScanCompleteInput["updateSupply"];
		if (pair.updateSupply && supplyItem) {
			// Allow OCR unit corrections on the linked supply row (same as dock).
			updateSupply = {
				quantity: Math.min(
					Math.max(0, pair.updateSupply.quantity),
					MAX_ABSOLUTE_QTY,
				),
				unit: toSupportedUnit(pair.updateSupply.unit),
			};
		}

		return {
			scanItemId: pair.scanItemId,
			supplyItemId: pair.supplyItemId ?? null,
			dock,
			updateSupply,
		};
	});
}

export async function completeSupplyScan(
	env: Env,
	organizationId: string,
	listId: string,
	body: SupplyScanCompleteRequest,
	options: SupplyListOperationOptions = {},
) {
	const idempotencyKey = scanCompleteIdempotencyKey(
		organizationId,
		body.requestId,
	);
	const cached = await env.RATION_KV.get(idempotencyKey);
	if (cached) {
		return JSON.parse(cached) as {
			docked: number;
			supplyUpdated: number;
			supplyRemoved: number;
			replayed: true;
		};
	}

	const scanItems = await assertScanJobReady(
		env,
		organizationId,
		body.requestId,
	);
	const list = await assertListOwned(env.DB, organizationId, listId);
	const completeInputs = buildSanitizedScanCompleteInputs(
		body.pairs,
		scanItems,
		list.items,
	);

	try {
		const result = await completeSupplyFromScan(
			env,
			organizationId,
			listId,
			completeInputs,
			options,
		);

		const payload = { ...result, replayed: false as const };
		await env.RATION_KV.put(idempotencyKey, JSON.stringify(payload), {
			expirationTtl: SCAN_COMPLETE_IDEMPOTENCY_TTL,
		});
		return payload;
	} catch (e) {
		if (e instanceof CapacityExceededError) throw e;
		if (e instanceof SupplyScanError) throw e;
		if (e instanceof Error && e.message.includes("Supply list not found")) {
			throw new SupplyScanError("Supply list not found", "list_not_found");
		}
		throw e;
	}
}

/** Validates supply-only IDs belong to the list (no-op beyond validation). */
export async function validateSupplyOnlyIds(
	env: Env,
	listId: string,
	supplyOnlyIds: string[] | undefined,
) {
	if (!supplyOnlyIds?.length) return;
	const d1 = drizzle(env.DB);
	const rows = await d1
		.select({ id: supplyItem.id })
		.from(supplyItem)
		.where(eq(supplyItem.listId, listId));
	const foundIds = new Set(rows.map((r) => r.id));
	for (const id of supplyOnlyIds) {
		if (!foundIds.has(id)) {
			throw new SupplyScanError("Invalid supply item", "invalid_items");
		}
	}
}
