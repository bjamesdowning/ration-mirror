import { describe, expect, it, vi } from "vitest";
import {
	chunkNamesForResolve,
	NUTRITION_RESOLVE_API_MAX_NAMES,
	resolveNutritionInChunks,
	shouldReresolveNutritionAfterNameChange,
	uniqueTrimmedNames,
} from "~/lib/nutrition/scan-review-resolve";

describe("uniqueTrimmedNames / chunkNamesForResolve", () => {
	it("dedupes and trims", () => {
		expect(uniqueTrimmedNames([" Milk ", "Milk", "Eggs", ""])).toEqual([
			"Milk",
			"Eggs",
		]);
	});

	it("chunks within client size and API max", () => {
		const names = Array.from({ length: 23 }, (_, i) => `item-${i}`);
		expect(chunkNamesForResolve(names, 10)).toHaveLength(3);
		expect(chunkNamesForResolve(names, 10)[0]).toHaveLength(10);
		expect(chunkNamesForResolve(names, 10)[2]).toHaveLength(3);
		expect(chunkNamesForResolve(names, 100)[0]?.length).toBeLessThanOrEqual(
			NUTRITION_RESOLVE_API_MAX_NAMES,
		);
	});
});

describe("shouldReresolveNutritionAfterNameChange", () => {
	it("returns true when trimmed name changes and source is not override", () => {
		expect(
			shouldReresolveNutritionAfterNameChange({
				previousName: "Milk",
				nextName: "Almond milk",
				nutritionSource: "usda",
			}),
		).toBe(true);
		expect(
			shouldReresolveNutritionAfterNameChange({
				previousName: " Milk ",
				nextName: "Eggs",
				nutritionSource: "ai_estimate",
			}),
		).toBe(true);
		expect(
			shouldReresolveNutritionAfterNameChange({
				previousName: "Milk",
				nextName: "Eggs",
				nutritionSource: null,
			}),
		).toBe(true);
	});

	it("returns false when name is unchanged (including trim-only)", () => {
		expect(
			shouldReresolveNutritionAfterNameChange({
				previousName: "Milk",
				nextName: "Milk",
				nutritionSource: "usda",
			}),
		).toBe(false);
		expect(
			shouldReresolveNutritionAfterNameChange({
				previousName: " Milk ",
				nextName: "Milk",
				nutritionSource: "usda",
			}),
		).toBe(false);
	});

	it("returns false when next name is empty", () => {
		expect(
			shouldReresolveNutritionAfterNameChange({
				previousName: "Milk",
				nextName: "   ",
				nutritionSource: "usda",
			}),
		).toBe(false);
	});

	it("returns false for user_override even when name changes", () => {
		expect(
			shouldReresolveNutritionAfterNameChange({
				previousName: "Milk",
				nextName: "Almond milk",
				nutritionSource: "user_override",
			}),
		).toBe(false);
	});
});

describe("resolveNutritionInChunks", () => {
	it("calls onChunk per successful batch and returns done", async () => {
		const onChunk = vi.fn();
		const fetchChunk = vi.fn(async (chunk: string[]) => ({
			ok: true as const,
			snapshots: Object.fromEntries(chunk.map((n) => [n, { name: n }])),
		}));
		const status = await resolveNutritionInChunks({
			names: ["a", "b", "c", "d", "e"],
			chunkSize: 2,
			fetchChunk,
			onChunk,
		});
		expect(status).toBe("done");
		expect(fetchChunk).toHaveBeenCalledTimes(3);
		expect(onChunk).toHaveBeenCalledTimes(3);
		expect(onChunk.mock.calls[0]?.[0]).toEqual({
			a: { name: "a" },
			b: { name: "b" },
		});
	});

	it("returns failed when every chunk fails", async () => {
		const status = await resolveNutritionInChunks({
			names: ["a", "b"],
			chunkSize: 1,
			fetchChunk: async () => ({ ok: false, snapshots: {} }),
			onChunk: () => {},
		});
		expect(status).toBe("failed");
	});

	it("keeps going after a soft-failed chunk", async () => {
		const onChunk = vi.fn();
		let calls = 0;
		const status = await resolveNutritionInChunks({
			names: ["a", "b"],
			chunkSize: 1,
			fetchChunk: async (chunk) => {
				calls += 1;
				if (calls === 1) throw new Error("network");
				return { ok: true, snapshots: { [chunk[0] ?? ""]: null } };
			},
			onChunk,
		});
		expect(status).toBe("done");
		expect(onChunk).toHaveBeenCalledTimes(1);
	});
});
