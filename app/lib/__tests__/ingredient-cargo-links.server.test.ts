import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEnv } from "~/test/helpers/mock-env";

const {
	mockFetchOrgCargoIndex,
	mockFindSimilarCargoBatch,
	mockGetMatchCacheVersion,
} = vi.hoisted(() => ({
	mockFetchOrgCargoIndex: vi.fn(),
	mockFindSimilarCargoBatch: vi.fn(),
	mockGetMatchCacheVersion: vi.fn(),
}));

vi.mock("../cargo-index.server", () => ({
	fetchOrgCargoIndex: (...args: unknown[]) => mockFetchOrgCargoIndex(...args),
}));

vi.mock("../vector.server", () => ({
	findSimilarCargoBatch: (...args: unknown[]) =>
		mockFindSimilarCargoBatch(...args),
	SIMILARITY_THRESHOLDS: { INGREDIENT_MATCH: 0.78 },
}));

vi.mock("../readiness-cache.server", () => ({
	getMatchCacheVersion: (...args: unknown[]) =>
		mockGetMatchCacheVersion(...args),
}));

function cargoRow(
	id: string,
	name: string,
	quantity = 1,
): {
	id: string;
	name: string;
	domain: string;
	quantity: number;
	unit: string;
} {
	return { id, name, domain: "food", quantity, unit: "g" };
}

describe("resolveIngredientCargoLinks", () => {
	beforeEach(() => {
		mockFetchOrgCargoIndex.mockReset();
		mockFindSimilarCargoBatch.mockReset();
		mockGetMatchCacheVersion.mockReset();
		mockGetMatchCacheVersion.mockResolvedValue("1");
		mockFindSimilarCargoBatch.mockResolvedValue(new Map());
	});

	it("matches chopped onions to onions via exact dedup", async () => {
		mockFetchOrgCargoIndex.mockResolvedValue([cargoRow("c-onions", "onions")]);
		const { resolveIngredientCargoLinks } = await import(
			"~/lib/ingredient-cargo-links.server"
		);
		const links = await resolveIngredientCargoLinks(createMockEnv(), "org-1", [
			"chopped onions",
		]);
		expect(links.get("chopped onions")?.matchType).toBe("exact");
		expect(links.get("chopped onions")?.primaryCargoId).toBe("c-onions");
	});

	it("matches bread to white bread via token phase", async () => {
		mockFetchOrgCargoIndex.mockResolvedValue([
			cargoRow("c-bread", "white bread"),
		]);
		const { resolveIngredientCargoLinks } = await import(
			"~/lib/ingredient-cargo-links.server"
		);
		const links = await resolveIngredientCargoLinks(createMockEnv(), "org-1", [
			"bread",
		]);
		expect(links.get("bread")?.matchType).toBe("token");
		expect(links.get("bread")?.cargoIds).toContain("c-bread");
		expect(mockFindSimilarCargoBatch).not.toHaveBeenCalled();
	});

	it("uses vector fallback when exact and token miss", async () => {
		mockFetchOrgCargoIndex.mockResolvedValue([
			cargoRow("c-bread", "white bread"),
		]);
		mockFindSimilarCargoBatch.mockResolvedValue(
			new Map([
				[
					"ciabatta",
					[{ itemId: "c-bread", itemName: "white bread", score: 0.91 }],
				],
			]),
		);
		const { resolveIngredientCargoLinks } = await import(
			"~/lib/ingredient-cargo-links.server"
		);
		const links = await resolveIngredientCargoLinks(createMockEnv(), "org-1", [
			"ciabatta",
		]);
		expect(links.get("ciabatta")?.matchType).toBe("vector");
		expect(links.get("ciabatta")?.primaryCargoId).toBe("c-bread");
		expect(mockFindSimilarCargoBatch).toHaveBeenCalledWith(
			expect.anything(),
			"org-1",
			["ciabatta"],
			expect.objectContaining({ threshold: 0.78 }),
		);
	});

	it("does not token-match fragile compounds (milk ↛ coconut milk)", async () => {
		mockFetchOrgCargoIndex.mockResolvedValue([
			cargoRow("c-coconut", "coconut milk"),
		]);
		const { resolveIngredientCargoLinks } = await import(
			"~/lib/ingredient-cargo-links.server"
		);
		const links = await resolveIngredientCargoLinks(createMockEnv(), "org-1", [
			"milk",
		]);
		expect(links.get("milk")?.matchType).toBe("none");
		expect(links.get("milk")?.primaryCargoId).toBeNull();
	});

	it("reuses KV cache and skips Vectorize on hit", async () => {
		const env = createMockEnv();
		(env.RATION_KV.get as ReturnType<typeof vi.fn>).mockResolvedValue({
			entries: {
				ciabatta: {
					cargoIds: ["c-bread"],
					primaryCargoId: "c-bread",
					matchType: "vector",
				},
			},
		});
		const { resolveIngredientCargoLinks } = await import(
			"~/lib/ingredient-cargo-links.server"
		);
		const links = await resolveIngredientCargoLinks(env, "org-1", ["ciabatta"]);
		expect(links.get("ciabatta")?.primaryCargoId).toBe("c-bread");
		expect(mockFetchOrgCargoIndex).not.toHaveBeenCalled();
		expect(mockFindSimilarCargoBatch).not.toHaveBeenCalled();
	});

	it("writes resolved links to KV on miss", async () => {
		mockFetchOrgCargoIndex.mockResolvedValue([
			cargoRow("c-bread", "white bread"),
		]);
		const env = createMockEnv();
		const { resolveIngredientCargoLinks } = await import(
			"~/lib/ingredient-cargo-links.server"
		);
		await resolveIngredientCargoLinks(env, "org-1", ["bread"]);
		expect(env.RATION_KV.put).toHaveBeenCalledWith(
			"ing-links:org-1:1",
			expect.stringContaining("c-bread"),
			expect.objectContaining({ expirationTtl: 600 }),
		);
	});

	it("prefers the highest-quantity bucket as primary", async () => {
		mockFetchOrgCargoIndex.mockResolvedValue([
			cargoRow("c-small", "white bread", 1),
			cargoRow("c-large", "white bread", 8),
		]);
		const { resolveIngredientCargoLinks } = await import(
			"~/lib/ingredient-cargo-links.server"
		);
		const links = await resolveIngredientCargoLinks(createMockEnv(), "org-1", [
			"bread",
		]);
		expect(links.get("bread")?.primaryCargoId).toBe("c-large");
		expect(links.get("bread")?.cargoIds).toEqual(
			expect.arrayContaining(["c-small", "c-large"]),
		);
	});
});

describe("enrichIngredientsWithResolvedCargo", () => {
	beforeEach(() => {
		mockFetchOrgCargoIndex.mockReset();
		mockFindSimilarCargoBatch.mockReset();
		mockGetMatchCacheVersion.mockReset();
		mockGetMatchCacheVersion.mockResolvedValue("1");
		mockFindSimilarCargoBatch.mockResolvedValue(new Map());
	});

	it("keeps an explicit org-scoped cargoId without name matching", async () => {
		mockFetchOrgCargoIndex.mockResolvedValue([
			cargoRow("linked", "totally different"),
		]);
		const { enrichIngredientsWithResolvedCargo } = await import(
			"~/lib/ingredient-cargo-links.server"
		);
		const result = await enrichIngredientsWithResolvedCargo(
			createMockEnv(),
			"org-1",
			[{ ingredientName: "flour", cargoId: "linked" }],
		);
		expect(result[0].resolvedCargoId).toBe("linked");
		expect(mockFindSimilarCargoBatch).not.toHaveBeenCalled();
	});

	it("ignores a cargoId that is not in the org index", async () => {
		mockFetchOrgCargoIndex.mockResolvedValue([
			cargoRow("c-bread", "white bread"),
		]);
		const { enrichIngredientsWithResolvedCargo } = await import(
			"~/lib/ingredient-cargo-links.server"
		);
		const result = await enrichIngredientsWithResolvedCargo(
			createMockEnv(),
			"org-1",
			[{ ingredientName: "bread", cargoId: "other-org-item" }],
		);
		expect(result[0].resolvedCargoId).toBe("c-bread");
	});
});
