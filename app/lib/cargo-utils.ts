/**
 * Pure utility functions extracted from cargo.server.ts for testability.
 * These functions have no database or infrastructure dependencies.
 */

import { normalizeForCargoDedup } from "./matching";

/**
 * Extends normalizeForCargoDedup with plural stripping for Phase 1 dedup keys.
 * Strips common English plural suffixes so singular/plural variants share the same key:
 *   "eggs" → "egg", "tomatoes" → "tomato", "potatoes" → "potato", "dishes" → "dish"
 */
export function normalizeForCargoKey(name: string): string {
	const base = normalizeForCargoDedup(name);
	// Order matters: check longer suffixes first
	if (base.endsWith("oes")) return base.slice(0, -2); // tomatoes→tomato, potatoes→potato
	if (base.endsWith("shes")) return base.slice(0, -2); // dishes→dish
	if (base.endsWith("ches")) return base.slice(0, -2); // peaches→peach
	if (base.endsWith("xes")) return base.slice(0, -2); // boxes→box
	if (base.endsWith("zes")) return base.slice(0, -2); // pizzas handled below
	if (base.endsWith("ies")) return `${base.slice(0, -3)}y`; // berries→berry, cherries→cherry
	if (base.endsWith("es") && base.length > 3) return base.slice(0, -1); // grapes→grape
	if (base.endsWith("s") && base.length > 2) return base.slice(0, -1); // eggs→egg, carrots→carrot
	return base;
}

export function normalizeTags(tags: unknown): string[] {
	if (Array.isArray(tags)) {
		return tags.filter((tag) => typeof tag === "string") as string[];
	}
	if (typeof tags === "string") {
		try {
			const parsed = JSON.parse(tags);
			if (Array.isArray(parsed)) {
				return parsed.filter((tag) => typeof tag === "string") as string[];
			}
		} catch {
			return tags
				.split(",")
				.map((tag) => tag.trim())
				.filter(Boolean);
		}
	}
	return [];
}

/**
 * Computes the display status for an inventory item based on its expiry date.
 * @param now - Injectable for deterministic testing (defaults to current time)
 */
export function calculateInventoryStatus(
	expiresAt?: Date | null,
	now = new Date(),
): string {
	if (!expiresAt) return "stable";
	const msPerDay = 1000 * 60 * 60 * 24;
	const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / msPerDay;
	if (daysUntilExpiry < 0) return "biohazard";
	if (daysUntilExpiry < 3) return "decay_imminent";
	return "stable";
}
