/**
 * Pure helpers for manual receipt ↔ supply linking on the review screen.
 * Candidates come from the scan-match payload (paired + supply-only rows).
 */

export function collectSupplyLinkCandidates<T extends { id: string }>(
	fromPairs: Array<T | null | undefined>,
	supplyOnly: T[],
): T[] {
	const byId = new Map<string, T>();
	for (const item of fromPairs) {
		if (item) byId.set(item.id, item);
	}
	for (const item of supplyOnly) {
		byId.set(item.id, item);
	}
	return [...byId.values()];
}

export function availableSupplyForLink<T extends { id: string }>(
	allCandidates: T[],
	linkedIds: Iterable<string>,
): T[] {
	const linked = new Set(linkedIds);
	return allCandidates.filter((item) => !linked.has(item.id));
}

export function computeDockHasDelta(
	dockQuantity: number,
	dockUnit: string,
	supply: { quantity: number; unit: string } | null | undefined,
): boolean {
	if (!supply) return false;
	return (
		Math.abs(dockQuantity - supply.quantity) > 0.0001 ||
		dockUnit !== supply.unit
	);
}
