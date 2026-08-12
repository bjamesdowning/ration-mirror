import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireSocialContent } from "~/lib/import/social-content.server";

const RICH_RECIPE_DESCRIPTION =
	"Pasta 200g spaghetti 100g pancetta 2 eggs\n1. Boil pasta\n2. Fry pancetta\n3. Toss with eggs";

describe("acquireSocialContent", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("skips transcript when oEmbed caption already has strong recipe signal", async () => {
		const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("tiktok.com/oembed")) {
				return {
					ok: true,
					json: async () => ({ title: RICH_RECIPE_DESCRIPTION }),
				};
			}
			if (url.includes("/v1/metadata")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						title: "Pasta",
						description: null,
						url: "https://www.tiktok.com/@u/video/1",
					}),
				};
			}
			return { ok: false, status: 404, json: async () => ({}) };
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
		const transcriptCalls = fetchSpy.mock.calls.filter((c) =>
			String(c[0]).includes("/v1/transcript"),
		);
		expect(transcriptCalls).toHaveLength(0);
	});

	it("uses rich Supadata metadata and skips transcript when oEmbed is thin", async () => {
		const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("tiktok.com/oembed")) {
				return {
					ok: true,
					json: async () => ({ title: "yummy!" }),
				};
			}
			if (url.includes("/v1/metadata")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						title: "Creamy pasta",
						description: RICH_RECIPE_DESCRIPTION,
						url: "https://www.tiktok.com/@u/video/2",
						platform: "tiktok",
					}),
				};
			}
			return { ok: false, status: 404, json: async () => ({}) };
		});
		vi.stubGlobal("fetch", fetchSpy);

		const result = await acquireSocialContent(
			{ SUPADATA_API_KEY: "key" },
			"https://www.tiktok.com/@u/video/2",
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.content.evidence).toContain("supadata_metadata");
			expect(result.content.evidence).not.toContain("supadata");
			expect(result.content.description).toContain("200g spaghetti");
			expect(result.content.transcript).toBeUndefined();
		}
		const transcriptCalls = fetchSpy.mock.calls.filter((c) =>
			String(c[0]).includes("/v1/transcript"),
		);
		expect(transcriptCalls).toHaveLength(0);
	});

	it("calls native transcript when metadata is thin", async () => {
		const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("tiktok.com/oembed")) {
				return {
					ok: true,
					json: async () => ({ title: "yummy!" }),
				};
			}
			if (url.includes("/v1/metadata")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						title: "yummy!",
						description: "short clip",
						url: "https://www.tiktok.com/@u/video/3",
					}),
				};
			}
			if (url.includes("/v1/transcript")) {
				expect(url).toContain("mode=native");
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
		});
		vi.stubGlobal("fetch", fetchSpy);

		const result = await acquireSocialContent(
			{ SUPADATA_API_KEY: "key" },
			"https://www.tiktok.com/@u/video/3",
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.content.evidence).toContain("supadata");
			expect(result.content.transcript).toBeTruthy();
		}
	});

	it("continues when native transcript is empty if metadata is rich enough", async () => {
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
				if (url.includes("/v1/metadata")) {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							title: "Quick snack",
							// Long enough for CONTENT_TOO_SHORT but not strong recipe signal
							description:
								"Watch me make this fun kitchen experiment with friends at home tonight wow wow wow wow wow wow",
							url: "https://www.tiktok.com/@u/video/4",
						}),
					};
				}
				if (url.includes("/v1/transcript")) {
					return {
						ok: false,
						status: 206,
						json: async () => ({
							message: "No transcript available",
							error: "empty",
						}),
					};
				}
				return { ok: false, status: 404, json: async () => ({}) };
			}),
		);

		const result = await acquireSocialContent(
			{ SUPADATA_API_KEY: "key" },
			"https://www.tiktok.com/@u/video/4",
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.content.transcript).toBeUndefined();
			expect(result.content.evidence).toContain("supadata_metadata");
			expect(result.content.evidence).not.toContain("supadata");
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
				if (url.includes("/v1/metadata")) {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							title: "yummy!",
							description: "hi",
							url: "https://www.tiktok.com/@u/video/5",
						}),
					};
				}
				if (url.includes("/v1/transcript")) {
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
			"https://www.tiktok.com/@u/video/5",
		);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe("IMPORT_PROVIDER_UNAVAILABLE");
			expect(result.softFailToPhoto).toBe(true);
		}
	});
});
