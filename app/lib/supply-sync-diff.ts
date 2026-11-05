import { normalizeForCargoDedup } from "./matching";

/**
 * Net shopping-line identity: `contributionKey` (normalized name + domain)
 * plus the line's base unit. A rebuild that deletes and reinserts the same
 * line is not a new line.
 */
export type SupplyDiffLine = {
	normalizedName: string;
	domain: string;
	unit: string;
	quantity: number;
};

export type SupplySyncLineCounts = {
	newLines: number;
	removedLines: number;
	changedLines: number;
};

export type SupplySyncRow = {
	name: string;
	domain?: string | null;
	unit?: string | null;
	quantity?: number | null;
	baseUnit?: string | null;
	baseQuantity?: number | null;
};

const QUANTITY_EPSILON = 1e-4;

function supplyDiffKey(line: SupplyDiffLine): string {
	return `${line.normalizedName}__${line.domain}__${line.unit}`;
}

function totals(lines: readonly SupplyDiffLine[]): Map<string, number> {
	const summed = new Map<string, number>();
	for (const line of lines) {
		if (!line.normalizedName) continue;
		const key = supplyDiffKey(line);
		summed.set(key, (summed.get(key) ?? 0) + line.quantity);
	}
	return summed;
}

/** Before/after diff of shopping lines. Counts lines, not database rows. */
export function diffSupplyRows(
	before: readonly SupplyDiffLine[],
	after: readonly SupplyDiffLine[],
): SupplySyncLineCounts {
	const beforeTotals = totals(before);
	const afterTotals = totals(after);
	let newLines = 0;
	let removedLines = 0;
	let changedLines = 0;
	const keys = new Set([...beforeTotals.keys(), ...afterTotals.keys()]);
	for (const key of keys) {
		const had = beforeTotals.has(key);
		const has = afterTotals.has(key);
		if (!had && has) {
			newLines += 1;
			continue;
		}
		if (had && !has) {
			removedLines += 1;
			continue;
		}
		const beforeQty = beforeTotals.get(key) ?? 0;
		const afterQty = afterTotals.get(key) ?? 0;
		if (Math.abs(beforeQty - afterQty) > QUANTITY_EPSILON) {
			changedLines += 1;
		}
	}
	return { newLines, removedLines, changedLines };
}

export function formatSupplySyncCounts(counts: SupplySyncLineCounts): string {
	return `${counts.newLines} new, ${counts.removedLines} removed, ${counts.changedLines} changed`;
}

/** Map a stored or inserted supply row onto the diff identity. */
export function supplyItemToDiffLine(row: SupplySyncRow): SupplyDiffLine {
	const name = typeof row.name === "string" ? row.name : "";
	const domain = row.domain && row.domain.length > 0 ? row.domain : "food";
	const fallbackUnit = row.unit && row.unit.length > 0 ? row.unit : "unit";
	const unit =
		row.baseUnit && row.baseUnit.length > 0 ? row.baseUnit : fallbackUnit;
	const quantity =
		typeof row.baseQuantity === "number" && Number.isFinite(row.baseQuantity)
			? row.baseQuantity
			: typeof row.quantity === "number" && Number.isFinite(row.quantity)
				? row.quantity
				: 0;
	return {
		normalizedName: normalizeForCargoDedup(name),
		domain,
		unit,
		quantity,
	};
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function countsFromRecord(
	record: Record<string, unknown>,
): SupplySyncLineCounts | null {
	if (
		isFiniteNumber(record.newLines) &&
		isFiniteNumber(record.removedLines) &&
		isFiniteNumber(record.changedLines)
	) {
		return {
			newLines: record.newLines,
			removedLines: record.removedLines,
			changedLines: record.changedLines,
		};
	}
	return null;
}

/**
 * Read the net-line sentence from a sync summary or a tool envelope.
 * Returns null when the payload has no line counts.
 */
export function readSupplySyncChangeLabel(output: unknown): string | null {
	if (!output || typeof output !== "object") return null;
	const record = output as Record<string, unknown>;
	if (record.summary && typeof record.summary === "object") {
		const fromSummary = countsFromRecord(
			record.summary as Record<string, unknown>,
		);
		if (fromSummary) return formatSupplySyncCounts(fromSummary);
	}
	const direct = countsFromRecord(record);
	if (direct) return formatSupplySyncCounts(direct);
	if (record.data && typeof record.data === "object") {
		return readSupplySyncChangeLabel(record.data);
	}
	return null;
}
