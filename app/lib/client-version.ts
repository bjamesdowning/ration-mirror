const DOTTED_VERSION = /^\d+(?:\.\d+)*$/;

/**
 * Compares dotted numeric versions (`1.5.11` vs `1.5.2`); missing parts count as 0.
 * Returns null when either side is not purely numeric so callers can fail open.
 */
export function compareVersions(a: string, b: string): number | null {
	const left = a.trim();
	const right = b.trim();
	if (!DOTTED_VERSION.test(left) || !DOTTED_VERSION.test(right)) return null;
	const leftParts = left.split(".").map(Number);
	const rightParts = right.split(".").map(Number);
	const length = Math.max(leftParts.length, rightParts.length);
	for (let i = 0; i < length; i++) {
		const diff = (leftParts[i] ?? 0) - (rightParts[i] ?? 0);
		if (diff !== 0) return diff < 0 ? -1 : 1;
	}
	return 0;
}

export function isVersionAtLeast(
	version: string | undefined,
	floor: string,
): boolean {
	if (!version) return false;
	const order = compareVersions(version, floor);
	return order !== null && order >= 0;
}
