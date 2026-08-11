import { afterEach, describe, expect, it, vi } from "vitest";
import {
	fetchTranscript,
	isSupadataUnavailable,
	SupadataError,
	scrapeWebPage,
} from "~/lib/import/supadata.server";

describe("isSupadataUnavailable", () => {
	it("treats config timeout auth and 5xx as unavailable", () => {
		expect(isSupadataUnavailable(new SupadataError("x", "config"))).toBe(true);
		expect(isSupadataUnavailable(new SupadataError("x", "timeout"))).toBe(true);
		expect(isSupadataUnavailable(new SupadataError("x", "auth", 401))).toBe(
			true,
		);
		expect(isSupadataUnavailable(new SupadataError("x", "server", 503))).toBe(
			true,
		);
		expect(isSupadataUnavailable(new Error("network"))).toBe(true);
	});

	it("does not treat empty product miss as unavailable", () => {
		expect(isSupadataUnavailable(new SupadataError("x", "empty", 404))).toBe(
			false,
		);
	});
});

describe("supadata.server", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("scrapeWebPage returns markdown content", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					url: "https://example.com/r",
					content: "# Recipe\n\nIngredients...",
					name: "Soup",
				}),
			}),
		);
		const result = await scrapeWebPage(
			{ SUPADATA_API_KEY: "key" },
			"https://example.com/r",
		);
		expect(result.content).toContain("Ingredients");
		expect(result.name).toBe("Soup");
	});

	it("scrapeWebPage throws on empty content", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ content: "   " }),
			}),
		);
		await expect(
			scrapeWebPage({ SUPADATA_API_KEY: "key" }, "https://example.com/r"),
		).rejects.toBeInstanceOf(SupadataError);
	});

	it("fetchTranscript returns text and caches in KV", async () => {
		const store = new Map<string, string>();
		const kv = {
			get: async (key: string) => store.get(key) ?? null,
			put: async (key: string, value: string) => {
				store.set(key, value);
			},
		} as unknown as KVNamespace;

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({ content: "mix flour and eggs then bake" }),
			}),
		);

		const env = { SUPADATA_API_KEY: "key", RATION_KV: kv };
		const first = await fetchTranscript(env, "https://tiktok.com/x");
		expect(first.text).toContain("flour");
		const second = await fetchTranscript(env, "https://tiktok.com/x");
		expect(second.text).toContain("flour");
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("requires API key", async () => {
		await expect(
			scrapeWebPage({}, "https://example.com"),
		).rejects.toMatchObject({ code: "config" });
	});
});
