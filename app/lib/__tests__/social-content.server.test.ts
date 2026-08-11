import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireSocialContent } from "~/lib/import/social-content.server";

describe("acquireSocialContent", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("skips Supadata when caption already has strong recipe signal", async () => {
		const fetchSpy = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				title:
					"Pasta 200g spaghetti 100g pancetta 2 eggs\n1. Boil pasta\n2. Fry pancetta\n3. Toss with eggs",
			}),
		});
		vi.stubGlobal("fetch", fetchSpy);

		const result = await acquireSocialContent(
			{ SUPADATA_API_KEY: "key" },
			"https://www.tiktok.com/@u/video/1",
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.content.evidence).toContain("oembed");
			expect(result.content.evidence).not.toContain("supadata");
			expect(result.content.transcript).toBeUndefined();
		}
		// Only oEmbed — no transcript call to api.supadata.ai
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("tiktok.com/oembed");
	});

	it("calls Supadata when metadata is thin", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.includes("tiktok.com/oembed")) {
					return {
						ok: true,
						json: async () => ({ title: "yummy!" }),
					};
				}
				if (url.includes("api.supadata.ai")) {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							content:
								"Add 200g flour and 2 eggs. Mix well. Bake for 20 minutes until golden. Cool and serve.",
						}),
					};
				}
				return { ok: false, status: 404, json: async () => ({}) };
			}),
		);

		const result = await acquireSocialContent(
			{ SUPADATA_API_KEY: "key" },
			"https://www.tiktok.com/@u/video/2",
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.content.evidence).toContain("supadata");
			expect(result.content.transcript).toBeTruthy();
		}
	});

	it("fails soft with IMPORT_PROVIDER_UNAVAILABLE when transcript needed and Supadata is down", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.includes("tiktok.com/oembed")) {
					return {
						ok: true,
						json: async () => ({ title: "yummy!" }),
					};
				}
				if (url.includes("api.supadata.ai")) {
					return {
						ok: false,
						status: 503,
						json: async () => ({ message: "unavailable" }),
					};
				}
				return { ok: false, status: 404, json: async () => ({}) };
			}),
		);

		const result = await acquireSocialContent(
			{ SUPADATA_API_KEY: "key" },
			"https://www.tiktok.com/@u/video/3",
		);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe("IMPORT_PROVIDER_UNAVAILABLE");
			expect(result.softFailToPhoto).toBe(true);
		}
	});
});
