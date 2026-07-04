import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { supplyItem } from "../db/schema";
import { CapacityExceededError } from "./capacity.server";
import { getQueueJob } from "./queue-job.server";
import { parseJobResultJson } from "./queue-status-loader.server";
import type { ScanResultItem } from "./schemas/scan";
import type { SupplyScanCompleteRequest } from "./schemas/supply-scan";
import {
	completeSupplyFromScan,
	getSupplyListById,
	type SupplyItemWithSource,
	type SupplyScanCompleteInput,
} from "./supply.server";
import {
	matchScanToSupply,
	SUPPLY_SCAN_FUZZY_THRESHOLD,
	scoreScanToSupplyItem,
} from "./supply-scan-match.server";
import { getUnitMultiplier, toSupportedUnit } from "./units";

const SCAN_COMPLETE_IDEMPOTENCY_TTL = 86_400;
/** Max dock qty multiplier vs receipt line (after unit conversion). */
const MAX_QTY_MULTIPLIER = 10;
const MAX_ABSOLUTE_QTY = 10_000;

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
 * Constrains client dock fields to the parsed receipt line. Quantity/unit may
 * be edited within compatible units and a bounded multiplier of the scan qty.
 */
export function sanitizeDockFromScanItem(
	scanItem: ScanResultItem,
	clientDock: SupplyScanCompleteRequest["pairs"][number]["dock"],
): SupplyScanCompleteInput["dock"] {
	const scanUnit = toSupportedUnit(scanItem.unit);
	const clientUnit = toSupportedUnit(clientDock.unit);
	const toScanMultiplier = getUnitMultiplier(clientUnit, scanUnit);
	if (toScanMultiplier === null && clientUnit !== scanUnit) {
		throw new SupplyScanError(
			"Dock unit incompatible with receipt line",
			"invalid_pair",
		);
	}

	const scanQtyInClientUnit =
		toScanMultiplier != null
			? scanItem.quantity / toScanMultiplier
			: scanItem.quantity;
	const maxQty = Math.min(
		MAX_ABSOLUTE_QTY,
		Math.max(scanQtyInClientUnit * MAX_QTY_MULTIPLIER, scanQtyInClientUnit + 1),
	);
	const quantity = Math.min(Math.max(0, clientDock.quantity), maxQty);

	return {
		name: scanItem.name,
		quantity,
		unit: clientUnit,
		domain: scanItem.domain,
		tags: scanItem.tags ?? [],
		expiresAt: clientDock.expiresAt ?? scanItem.expiresAt,
		mergeTargetId: clientDock.mergeTargetId,
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
			const unit = toSupportedUnit(pair.updateSupply.unit);
			if (getUnitMultiplier(unit, toSupportedUnit(supplyItem.unit)) === null) {
				throw new SupplyScanError(
					"Supply update unit incompatible with list row",
					"invalid_pair",
				);
			}
			updateSupply = {
				quantity: Math.min(
					Math.max(0, pair.updateSupply.quantity),
					MAX_ABSOLUTE_QTY,
				),
				unit,
			};
		}

		return {
			scanItemId: pair.scanItemId,
			supplyItemId: pair.supplyItemId,
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
