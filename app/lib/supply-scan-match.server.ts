import { normalizeForMatch, tokenMatchScore } from "./matching";
import { normalizeForCargoDedup } from "./matching.server";
import type { ScanResultItem } from "./schemas/scan";
import type { SupplyItemWithSource } from "./supply.server";
import {
	getUnitMultiplier,
	type SupportedUnit,
	toSupportedUnit,
} from "./units";

export type SupplyScanQuantityProposal = {
	dockQuantity: number;
	dockUnit: SupportedUnit;
	source: "receipt" | "supply" | "user";
	supplyQuantity: number;
	supplyUnit: SupportedUnit;
	receiptQuantity?: number;
	receiptUnit?: SupportedUnit;
	hasDelta: boolean;
};

export type SupplyScanPair = {
	scanItem: ScanResultItem;
	supplyItem: SupplyItemWithSource | null;
	matchScore: number;
	matchType: "exact" | "fuzzy" | "manual";
	wasPreChecked: boolean;
	quantityProposal: SupplyScanQuantityProposal;
};

export type SupplyScanMatchResult = {
	pairs: SupplyScanPair[];
	receiptOnly: ScanResultItem[];
	supplyOnly: SupplyItemWithSource[];
};

export const SUPPLY_SCAN_FUZZY_THRESHOLD = 0.8;
const FUZZY_THRESHOLD = SUPPLY_SCAN_FUZZY_THRESHOLD;
const CHECKED_BOOST = 0.15;
const RECEIPT_CONFIDENCE_MIN = 0.7;

function unitsCompatible(a: string, b: string): boolean {
	return getUnitMultiplier(toSupportedUnit(a), toSupportedUnit(b)) !== null;
}

/** Scores how well a receipt line matches a supply list row (used on scan-complete). */
export function scoreScanToSupplyItem(
	scanItem: ScanResultItem,
	supplyItem: SupplyItemWithSource,
): number {
	const scanNorm = normalizeForCargoDedup(scanItem.name);
	const supplyNorm = normalizeForCargoDedup(supplyItem.name);
	if (
		scanNorm === supplyNorm &&
		unitsCompatible(scanItem.unit, supplyItem.unit)
	) {
		return 1;
	}
	if (!unitsCompatible(scanItem.unit, supplyItem.unit)) {
		return 0;
	}
	const fuzzy = tokenMatchScore(
		normalizeForMatch(scanItem.name),
		normalizeForMatch(supplyItem.name),
	);
	if (fuzzy < FUZZY_THRESHOLD) return 0;
	let score = fuzzy;
	if (supplyItem.isPurchased) score = Math.min(1, score + CHECKED_BOOST);
	return score;
}

function buildQuantityProposal(
	scanItem: ScanResultItem,
	supplyItem: SupplyItemWithSource | null,
): SupplyScanQuantityProposal {
	const supplyUnit = toSupportedUnit(supplyItem?.unit ?? scanItem.unit);
	const supplyQuantity = supplyItem?.quantity ?? scanItem.quantity;
	const receiptUnit = toSupportedUnit(scanItem.unit);
	const receiptQuantity = scanItem.quantity;
	const receiptConfident =
		(scanItem.confidence ?? 1) >= RECEIPT_CONFIDENCE_MIN &&
		unitsCompatible(scanItem.unit, supplyUnit);

	if (receiptConfident) {
		const multiplier = getUnitMultiplier(receiptUnit, supplyUnit);
		const dockQuantity =
			multiplier != null ? receiptQuantity * multiplier : receiptQuantity;
		const hasDelta =
			supplyItem != null &&
			(Math.abs(dockQuantity - supplyQuantity) > 0.01 ||
				supplyUnit !== receiptUnit);
		return {
			dockQuantity,
			dockUnit: supplyUnit,
			source: "receipt",
			supplyQuantity,
			supplyUnit,
			receiptQuantity,
			receiptUnit,
			hasDelta,
		};
	}

	return {
		dockQuantity: supplyQuantity,
		dockUnit: supplyUnit,
		source: "supply",
		supplyQuantity,
		supplyUnit,
		receiptQuantity,
		receiptUnit,
		hasDelta: false,
	};
}

/**
 * Pairs receipt scan lines with supply list rows for the acceptance review UI.
 */
export function matchScanToSupply(
	scanItems: ScanResultItem[],
	supplyItems: SupplyItemWithSource[],
): SupplyScanMatchResult {
	const availableSupply = [...supplyItems];
	const pairs: SupplyScanPair[] = [];
	const receiptOnly: ScanResultItem[] = [];

	for (const scanItem of scanItems) {
		let bestIdx = -1;
		let bestScore = 0;
		for (let i = 0; i < availableSupply.length; i++) {
			const candidate = availableSupply[i];
			if (!candidate) continue;
			const score = scoreScanToSupplyItem(scanItem, candidate);
			if (score > bestScore) {
				bestScore = score;
				bestIdx = i;
			}
		}

		if (bestIdx >= 0 && bestScore >= FUZZY_THRESHOLD) {
			const [supplyItem] = availableSupply.splice(bestIdx, 1);
			if (!supplyItem) continue;
			pairs.push({
				scanItem,
				supplyItem,
				matchScore: bestScore,
				matchType: bestScore >= 0.99 ? "exact" : "fuzzy",
				wasPreChecked: supplyItem.isPurchased,
				quantityProposal: buildQuantityProposal(scanItem, supplyItem),
			});
		} else {
			receiptOnly.push(scanItem);
		}
	}

	return {
		pairs,
		receiptOnly,
		supplyOnly: availableSupply,
	};
}

export type SupplyScanCompletePair = {
	scanItemId: string;
	supplyItemId: string | null;
	dock: {
		name: string;
		quantity: number;
		unit: SupportedUnit;
		domain: string;
		tags?: string[];
		expiresAt?: string;
		mergeTargetId?: string;
	};
	updateSupply?: { quantity: number; unit: string };
};
