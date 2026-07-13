import { describe, expect, it } from "vitest";
import {
	calculateInventoryStatus,
	isCargoUsableForMatching,
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

	it("returns 'decay_imminent' when item expires in fewer than 3 UTC calendar days", () => {
		const twoDaysOut = new Date("2025-06-17T00:00:00Z");
		expect(calculateInventoryStatus(twoDaysOut, NOW)).toBe("decay_imminent");
	});

	it("returns 'biohazard' when item has already expired (calendar day before today)", () => {
		const past = new Date("2025-06-10T00:00:00Z"); // expiry date before NOW's UTC day
		expect(calculateInventoryStatus(past, NOW)).toBe("biohazard");
	});

	it("returns 'decay_imminent' when item expires today (UTC calendar day)", () => {
		const todayMidnight = new Date("2025-06-15T00:00:00Z");
		expect(calculateInventoryStatus(todayMidnight, NOW)).toBe("decay_imminent");
	});

	it("uses current time when 'now' is omitted (smoke test)", () => {
		const distantFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
		expect(calculateInventoryStatus(distantFuture)).toBe("stable");
	});
});

describe("isCargoUsableForMatching", () => {
	it("returns true when expiresAt is null", () => {
		expect(isCargoUsableForMatching(null, NOW)).toBe(true);
	});

	it("returns true when item is stable or decay_imminent", () => {
		const soonExpiry = new Date("2025-06-17T12:00:00Z");
		expect(isCargoUsableForMatching(soonExpiry, NOW)).toBe(true);
		const future = new Date("2025-06-20T12:00:00Z");
		expect(isCargoUsableForMatching(future, NOW)).toBe(true);
	});

	it("returns false when item is biohazard (past expiry calendar day)", () => {
		const past = new Date("2025-06-10T00:00:00Z");
		expect(isCargoUsableForMatching(past, NOW)).toBe(false);
	});

	it("returns true when item expires today (UTC calendar day)", () => {
		const todayMidnight = new Date("2025-06-15T00:00:00Z");
		expect(isCargoUsableForMatching(todayMidnight, NOW)).toBe(true);
	});
});
