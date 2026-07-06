import { describe, expect, it } from "vitest";
import {
	resolveCargoIdForName,
	resolveIngredientCargoId,
} from "~/lib/cargo-links";

describe("resolveCargoIdForName", () => {
	const rows = [
		{ id: "cargo-1", name: "Salmon Fillet" },
		{ id: "cargo-2", name: "canned tomatoes" },
	];

	it("matches by normalised name", () => {
		expect(resolveCargoIdForName("salmon fillet", rows)).toBe("cargo-1");
	});

	it("matches regional synonyms", () => {
		expect(resolveCargoIdForName("tinned tomatoes", rows)).toBe("cargo-2");
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
