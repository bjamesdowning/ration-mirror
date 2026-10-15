/** Lenient numeric parse for tool inputs: accepts "." or "," decimals. */
export function parseQuantityInputLoose(input: string): number | null {
	const trimmed = input.trim().replace(",", ".");
	if (!/^-?(\d+(\.\d+)?|\.\d+)$/.test(trimmed)) return null;
	const n = Number(trimmed);
	return Number.isFinite(n) ? n : null;
}
