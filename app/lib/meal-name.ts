/**
 * Meal and provision names are stored as typed.
 * Dedup and search stay on `normalizeForCargoDedup` and SQLite `LIKE`.
 */
export function storedMealName(name: string): string {
	return name.trim();
}

/**
 * ASCII case fold matching SQLite `COLLATE NOCASE` (A–Z only).
 * The Manifest picker orders with `ORDER BY name COLLATE NOCASE`.
 */
export function compareMealNamesNoCase(left: string, right: string): number {
	const fold = (value: string) =>
		value.replace(/[A-Z]/g, (char) =>
			String.fromCharCode(char.charCodeAt(0) + 32),
		);
	const a = fold(left);
	const b = fold(right);
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}
