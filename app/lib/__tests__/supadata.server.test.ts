import { afterEach, describe, expect, it, vi } from "vitest";
import {
	fetchMetadata,
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
		expect(isSupadataUnavailable(new SupadataError("x", "empty", 206))).toBe(
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

	it("fetchMetadata returns title and description and caches in KV", async () => {
		const store = new Map<string, string>();
		const kv = {
			get: async (key: string) => store.get(key) ?? null,
			put: async (key: string, value: string) => {
				store.set(key, value);
			},
		} as unknown as KVNamespace;

		const fetchSpy = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				url: "https://www.tiktok.com/@u/video/1",
				title: "Creamy pasta",
				description: "200g spaghetti\n1. Boil",
				platform: "tiktok",
			}),
		});
		vi.stubGlobal("fetch", fetchSpy);

		const env = { SUPADATA_API_KEY: "key", RATION_KV: kv };
		const first = await fetchMetadata(env, "https://tiktok.com/x");
		expect(first.title).toBe("Creamy pasta");
		expect(first.description).toContain("200g");
		expect(first.platform).toBe("tiktok");

		const second = await fetchMetadata(env, "https://tiktok.com/x");
		expect(second.title).toBe("Creamy pasta");
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/v1/metadata");
	});

	it("fetchMetadata soft-parses null title and description", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					url: "https://www.instagram.com/reel/x",
					title: null,
					description: null,
					platform: "instagram",
				}),
			}),
		);
		const result = await fetchMetadata(
			{ SUPADATA_API_KEY: "key" },
			"https://www.instagram.com/reel/x",
		);
		expect(result.title).toBeUndefined();
		expect(result.description).toBeUndefined();
		expect(result.url).toContain("instagram.com");
	});

	it("fetchTranscript returns text and caches by mode in KV", async () => {
		const store = new Map<string, string>();
		const kv = {
			get: async (key: string) => store.get(key) ?? null,
			put: async (key: string, value: string) => {
				store.set(key, value);
			},
		} as unknown as KVNamespace;

		const fetchSpy = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ content: "mix flour and eggs then bake" }),
		});
		vi.stubGlobal("fetch", fetchSpy);

		const env = { SUPADATA_API_KEY: "key", RATION_KV: kv };
		const first = await fetchTranscript(env, "https://tiktok.com/x", {
			mode: "native",
		});
		expect(first.text).toContain("flour");
		expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("mode=native");

		const second = await fetchTranscript(env, "https://tiktok.com/x", {
			mode: "native",
		});
		expect(second.text).toContain("flour");
		expect(fetchSpy).toHaveBeenCalledTimes(1);

		// Different mode must not reuse the native cache entry.
		await fetchTranscript(env, "https://tiktok.com/x", { mode: "auto" });
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		expect(String(fetchSpy.mock.calls[1]?.[0])).toContain("mode=auto");
	});

	it("fetchTranscript treats HTTP 206 as empty product miss", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 206,
				json: async () => ({ message: "No transcript" }),
			}),
		);
		await expect(
			fetchTranscript({ SUPADATA_API_KEY: "key" }, "https://tiktok.com/x", {
				mode: "native",
			}),
		).rejects.toMatchObject({ code: "empty", status: 206 });
	});

	it("requires API key", async () => {
		await expect(
			scrapeWebPage({}, "https://example.com"),
		).rejects.toMatchObject({ code: "config" });
	});
});
