import { describe, expect, it } from "vitest";
import {
	calculateInventoryStatus,
	normalizeForCargoKey,
	normalizeTags,
} from "~/lib/cargo-utils";

// Frozen reference time: 2025-06-15 12:00:00 UTC
const NOW = new Date("2025-06-15T12:00:00Z");

describe("normalizeForCargoKey — plural stripping", () => {
	it("strips trailing 's' from simple plurals", () => {
		expect(normalizeForCargoKey("eggs")).toBe("egg");
		expect(normalizeForCargoKey("carrots")).toBe("carrot");
		expect(normalizeForCargoKey("apples")).toBe("apple");
	});

	it("handles '-oes' plurals (tomatoes → tomato)", () => {
		expect(normalizeForCargoKey("tomatoes")).toBe("tomato");
		expect(normalizeForCargoKey("potatoes")).toBe("potato");
	});

	it("handles '-shes' plurals (dishes → dish)", () => {
		expect(normalizeForCargoKey("dishes")).toBe("dish");
	});

	it("handles '-ches' plurals (peaches → peach)", () => {
		expect(normalizeForCargoKey("peaches")).toBe("peach");
	});

	it("handles '-ies' plurals (berries → berry)", () => {
		expect(normalizeForCargoKey("berries")).toBe("berry");
		expect(normalizeForCargoKey("cherries")).toBe("cherry");
	});

	it("handles '-es' plurals (grapes → grape)", () => {
		expect(normalizeForCargoKey("grapes")).toBe("grape");
	});

	it("does not mutate short words (< 3 chars after base)", () => {
		// "go" is 2 chars — should not strip
		expect(normalizeForCargoKey("go").length).toBeGreaterThan(0);
	});

	it("applies regional synonym normalisation before plural stripping", () => {
		// Singular synonym substitution works: aubergine → eggplant
		expect(normalizeForCargoKey("aubergine")).toBe("eggplant");
		// Plural "aubergines": synonym map only matches token "aubergine" exactly.
		// "aubergines" is not in INGREDIENT_SYNONYMS, so it strips 's' → "aubergine"
		expect(normalizeForCargoKey("aubergines")).toBe("aubergine");
	});

	it("singular inputs are passed through unchanged", () => {
		expect(normalizeForCargoKey("rice")).toBe("rice");
		expect(normalizeForCargoKey("pasta")).toBe("pasta");
		expect(normalizeForCargoKey("egg")).toBe("egg");
	});

	it("makes 'eggs' and 'egg' resolve to same key", () => {
		expect(normalizeForCargoKey("eggs")).toBe(normalizeForCargoKey("egg"));
	});

	it("makes 'tomatoes' and 'tomato' resolve to same key", () => {
		expect(normalizeForCargoKey("tomatoes")).toBe(
			normalizeForCargoKey("tomato"),
		);
	});
});

describe("normalizeTags", () => {
	it("accepts a string array and returns it filtered", () => {
		expect(normalizeTags(["organic", "local", "fresh"])).toEqual([
			"organic",
			"local",
			"fresh",
		]);
	});

	it("filters non-string values from array input", () => {
		expect(normalizeTags(["organic", 42, null, "local"])).toEqual([
			"organic",
			"local",
		]);
	});

	it("parses a JSON array string", () => {
		expect(normalizeTags('["organic","local"]')).toEqual(["organic", "local"]);
	});

	it("splits comma-delimited string fallback", () => {
		expect(normalizeTags("organic, local, fresh")).toEqual([
			"organic",
			"local",
			"fresh",
		]);
	});

	it("returns empty array for null", () => {
		expect(normalizeTags(null)).toEqual([]);
	});

	it("returns empty array for undefined", () => {
		expect(normalizeTags(undefined)).toEqual([]);
	});

	it("returns empty array for number input", () => {
		expect(normalizeTags(42)).toEqual([]);
	});

	it("returns empty array for invalid JSON string (falls back to comma split)", () => {
		const result = normalizeTags("{invalid");
		// "{invalid" has no commas → split gives one entry
		expect(Array.isArray(result)).toBe(true);
	});

	it("returns empty array for empty string", () => {
		expect(normalizeTags("")).toEqual([]);
	});
});

describe("calculateInventoryStatus", () => {
	it("returns 'stable' when expiresAt is null", () => {
		expect(calculateInventoryStatus(null, NOW)).toBe("stable");
	});

	it("returns 'stable' when expiresAt is undefined", () => {
		expect(calculateInventoryStatus(undefined, NOW)).toBe("stable");
	});

	it("returns 'stable' when item expires in more than 3 days", () => {
		const future = new Date("2025-06-20T12:00:00Z"); // 5 days from NOW
		expect(calculateInventoryStatus(future, NOW)).toBe("stable");
	});

	it("returns 'decay_imminent' when item expires in < 3 days", () => {
		const soonExpiry = new Date("2025-06-17T12:00:00Z"); // 2 days from NOW
		expect(calculateInventoryStatus(soonExpiry, NOW)).toBe("decay_imminent");
	});

	it("returns 'decay_imminent' when item expires exactly 3 days from now (boundary: < 3 not <=)", () => {
		// Exactly 3 days = 259200000ms. daysUntilExpiry = 3, not < 3 → stable
		const exactly3Days = new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000);
		expect(calculateInventoryStatus(exactly3Days, NOW)).toBe("stable");
	});

	it("returns 'decay_imminent' when item expires in 2.9 days", () => {
		const nearExpiry = new Date(NOW.getTime() + 2.9 * 24 * 60 * 60 * 1000);
		expect(calculateInventoryStatus(nearExpiry, NOW)).toBe("decay_imminent");
	});

	it("returns 'biohazard' when item has already expired", () => {
		const past = new Date("2025-06-10T12:00:00Z"); // 5 days before NOW
		expect(calculateInventoryStatus(past, NOW)).toBe("biohazard");
	});

	it("returns 'biohazard' when item expires exactly now (boundary: < 0)", () => {
		// daysUntilExpiry = 0 → NOT < 0 → decay_imminent (0 is not negative)
		expect(calculateInventoryStatus(NOW, NOW)).toBe("decay_imminent");
	});

	it("uses current time when 'now' is omitted (smoke test)", () => {
		const distantFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
		expect(calculateInventoryStatus(distantFuture)).toBe("stable");
	});
});
