import { describe, expect, it } from "vitest";
import {
	resolveCargoIdForName,
	resolveIngredientCargoId,
} from "~/lib/cargo-links";

describe("resolveCargoIdForName", () => {
	const rows = [
		{ id: "cargo-1", name: "Salmon Fillet" },
		{ id: "cargo-2", name: "canned tomatoes" },
		{ id: "cargo-3", name: "white bread" },
		{ id: "cargo-4", name: "coconut milk" },
	];

	it("matches by normalised name", () => {
		expect(resolveCargoIdForName("salmon fillet", rows)).toBe("cargo-1");
	});

	it("matches regional synonyms", () => {
		expect(resolveCargoIdForName("tinned tomatoes", rows)).toBe("cargo-2");
	});

	it("matches token-phase specialization (bread → white bread)", () => {
		expect(resolveCargoIdForName("bread", rows)).toBe("cargo-3");
	});

	it("does not token-match fragile compounds", () => {
		expect(resolveCargoIdForName("milk", rows)).toBeNull();
	});

	it("returns null when no match", () => {
		expect(resolveCargoIdForName("unicorn meat", rows)).toBeNull();
	});
});

describe("resolveIngredientCargoId", () => {
	const rows = [{ id: "cargo-1", name: "Salmon" }];

	it("prefers explicit cargoId", () => {
		expect(
			resolveIngredientCargoId(
				{ ingredientName: "Salmon", cargoId: "linked-id" },
				rows,
			),
		).toBe("linked-id");
	});

	it("falls back to name resolution", () => {
		expect(
			resolveIngredientCargoId(
				{ ingredientName: "salmon", cargoId: null },
				rows,
			),
		).toBe("cargo-1");
	});
});
