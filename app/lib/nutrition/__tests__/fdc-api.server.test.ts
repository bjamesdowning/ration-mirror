import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockEnv } from "~/test/helpers/mock-env";
import { searchFdcApiCandidates } from "../fdc-api.server";

describe("searchFdcApiCandidates", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("returns empty when API key is missing", async () => {
		const env = createMockEnv();
		delete env.USDA_FDC_API_KEY;
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		await expect(searchFdcApiCandidates(env, "whole milk")).resolves.toEqual(
			[],
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("returns empty for blank query", async () => {
		const env = { ...createMockEnv(), USDA_FDC_API_KEY: "test-key" };
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		await expect(searchFdcApiCandidates(env, "   ")).resolves.toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("maps FDC search hits to candidates", async () => {
		const env = { ...createMockEnv(), USDA_FDC_API_KEY: "test-key" };
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					foods: [
						{
							fdcId: 746782,
							description: "Milk, whole, 3.25% milkfat, with added vitamin D",
							dataType: "Foundation",
						},
						{ fdcId: 1, description: "", dataType: "SR Legacy" },
						{ description: "missing id" },
					],
				}),
			}),
		);

		const hits = await searchFdcApiCandidates(env, "whole milk");
		expect(hits).toEqual([
			{
				fdcId: 746782,
				description: "Milk, whole, 3.25% milkfat, with added vitamin D",
				dataType: "Foundation",
			},
		]);
	});

	it("returns empty on HTTP or network failure", async () => {
		const env = { ...createMockEnv(), USDA_FDC_API_KEY: "test-key" };
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: false, status: 500 }),
		);
		await expect(searchFdcApiCandidates(env, "milk")).resolves.toEqual([]);

		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
		await expect(searchFdcApiCandidates(env, "milk")).resolves.toEqual([]);
	});
});
