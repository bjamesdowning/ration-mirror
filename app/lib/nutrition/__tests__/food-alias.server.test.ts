import { describe, expect, it, vi } from "vitest";
import { createMockEnv } from "~/test/helpers/mock-env";
import { lookupFoodAlias, lookupFoodAliasForName } from "../food-alias.server";

function mockNutritionDb(
	row: {
		normalizedName: string;
		fdcId: number;
		source: string;
	} | null,
) {
	const first = vi.fn().mockResolvedValue(row);
	const bind = vi.fn().mockReturnValue({ first });
	const prepare = vi.fn().mockReturnValue({ bind });
	return { prepare, bind, first };
}

describe("lookupFoodAlias", () => {
	it("returns null without NUTRITION_DB", async () => {
		const env = createMockEnv();
		delete env.NUTRITION_DB;
		await expect(lookupFoodAlias(env, "whole milk")).resolves.toBeNull();
	});

	it("returns null for empty normalized name", async () => {
		const env = createMockEnv();
		env.NUTRITION_DB = { prepare: vi.fn() } as unknown as D1Database;
		await expect(lookupFoodAlias(env, "")).resolves.toBeNull();
	});

	it("returns alias hit when row exists", async () => {
		const db = mockNutritionDb({
			normalizedName: "whole milk",
			fdcId: 746782,
			source: "curated",
		});
		const env = createMockEnv();
		env.NUTRITION_DB = db as unknown as D1Database;

		await expect(lookupFoodAlias(env, "whole milk")).resolves.toEqual({
			fdcId: 746782,
			normalizedName: "whole milk",
			source: "curated",
		});
		expect(db.prepare).toHaveBeenCalled();
		expect(db.bind).toHaveBeenCalledWith("whole milk");
	});

	it("returns null when query throws (missing table)", async () => {
		const prepare = vi.fn().mockReturnValue({
			bind: vi.fn().mockReturnValue({
				first: vi.fn().mockRejectedValue(new Error("no such table")),
			}),
		});
		const env = createMockEnv();
		env.NUTRITION_DB = { prepare } as unknown as D1Database;
		await expect(lookupFoodAlias(env, "whole milk")).resolves.toBeNull();
	});
});

describe("lookupFoodAliasForName", () => {
	it("normalizes before lookup", async () => {
		const db = mockNutritionDb({
			normalizedName: "olive oil",
			fdcId: 171413,
			source: "curated",
		});
		const env = createMockEnv();
		env.NUTRITION_DB = db as unknown as D1Database;

		await expect(
			lookupFoodAliasForName(env, "  Olive   Oil "),
		).resolves.toEqual({
			fdcId: 171413,
			normalizedName: "olive oil",
			source: "curated",
		});
		expect(db.bind).toHaveBeenCalledWith("olive oil");
	});
});
