/**
 * Pure string utilities for ingredient matching.
 * Isomorphic (client + server safe) - no D1, drizzle, or server APIs.
 */

export function normalizeForMatch(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^\w\s]/g, "")
		.replace(/\s+/g, " ");
}

const STOP_WORDS = new Set(["the", "a", "an", "of", "and", "or", "for"]);

export function tokenize(name: string): Set<string> {
	return new Set(
		normalizeForMatch(name)
			.split(" ")
			.filter((word) => word.length > 1 && !STOP_WORDS.has(word)),
	);
}

export function tokenMatchScore(a: string, b: string): number {
	const tokensA = tokenize(a);
	const tokensB = tokenize(b);
	if (tokensA.size === 0 || tokensB.size === 0) return 0;
	let intersection = 0;
	for (const token of tokensA) {
		if (tokensB.has(token)) intersection++;
	}
	const smaller = Math.min(tokensA.size, tokensB.size);
	return intersection / smaller;
}
