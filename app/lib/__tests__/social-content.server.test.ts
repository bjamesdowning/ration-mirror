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
						content: RICH_RECIPE_DESCRIPTION,
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
			expect(result.content.evidence).toContain("transcript_native");
			expect(result.content.transcript).toBeTruthy();
		}
	});

	it("continues when native transcript is empty if metadata is rich enough", async () => {
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
		});
		vi.stubGlobal("fetch", fetchSpy);

		const result = await acquireSocialContent(
			{ SUPADATA_API_KEY: "key" },
			"https://www.tiktok.com/@u/video/4",
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.content.transcript).toBeUndefined();
			expect(result.content.evidence).toContain("supadata_metadata");
			expect(result.content.evidence).not.toContain("transcript_native");
			expect(result.content.evidence).not.toContain("transcript_asr");
		}
		const modes = fetchSpy.mock.calls
			.map((c) => transcriptModeFromCall(c[0]))
			.filter((m): m is string => Boolean(m));
		expect(modes).toContain("native");
		expect(modes).toContain("generate");
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

	it("does not call generate when native transcript is a provider outage", async () => {
		const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("tiktok.com/oembed")) {
				return { ok: true, json: async () => ({ title: "yummy!" }) };
			}
			if (url.includes("/v1/metadata")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						title: "yummy!",
						description: "hi",
						url: "https://www.tiktok.com/@u/video/5b",
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
		});
		vi.stubGlobal("fetch", fetchSpy);

		await acquireSocialContent(
			{ SUPADATA_API_KEY: "key" },
			"https://www.tiktok.com/@u/video/5b",
		);

		const modes = fetchSpy.mock.calls
			.map((c) => transcriptModeFromCall(c[0]))
			.filter((m): m is string => Boolean(m));
		expect(modes).toEqual(["native"]);
	});

	it("falls back to generate ASR when native captions are a product miss", async () => {
		const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("tiktok.com/oembed")) {
				return { ok: true, json: async () => ({ title: "yummy pasta" }) };
			}
			if (url.includes("/v1/metadata")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						title: "yummy pasta",
						description: null,
						url: "https://www.tiktok.com/@u/video/6",
					}),
				};
			}
			if (url.includes("mode=native")) {
				return {
					ok: false,
					status: 206,
					json: async () => ({
						message: "No transcript available",
						error: "empty",
					}),
				};
			}
			if (url.includes("mode=generate")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						content:
							"Add 200 grams of pasta and two eggs. Boil until al dente. Toss with cheese and serve.",
					}),
				};
			}
			return { ok: false, status: 404, json: async () => ({}) };
		});
		vi.stubGlobal("fetch", fetchSpy);

		const result = await acquireSocialContent(
			{ SUPADATA_API_KEY: "key" },
			"https://www.tiktok.com/@u/video/6",
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.content.evidence).toContain("transcript_asr");
			expect(result.content.evidence).not.toContain("transcript_native");
			expect(result.content.transcript).toContain("200 grams of pasta");
		}
		const modes = fetchSpy.mock.calls
			.map((c) => transcriptModeFromCall(c[0]))
			.filter((m): m is string => Boolean(m));
		expect(modes).toEqual(["native", "generate"]);
	});

	it("skips generate when enableAsr is false", async () => {
		const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("tiktok.com/oembed")) {
				return { ok: true, json: async () => ({ title: "yummy pasta" }) };
			}
			if (url.includes("/v1/metadata")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						title: "yummy pasta",
						description:
							"Watch me make this fun kitchen experiment with friends at home tonight wow wow wow wow wow wow",
						url: "https://www.tiktok.com/@u/video/7",
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
		});
		vi.stubGlobal("fetch", fetchSpy);

		const result = await acquireSocialContent(
			{ SUPADATA_API_KEY: "key" },
			"https://www.tiktok.com/@u/video/7",
			{ enableAsr: false },
		);

		expect(result.ok).toBe(true);
		const modes = fetchSpy.mock.calls
			.map((c) => transcriptModeFromCall(c[0]))
			.filter((m): m is string => Boolean(m));
		expect(modes).toEqual(["native"]);
	});
});

function transcriptModeFromCall(input: RequestInfo | URL): string | null {
	const url = String(input);
	if (!url.includes("/v1/transcript")) return null;
	try {
		return new URL(url).searchParams.get("mode");
	} catch {
		if (url.includes("mode=generate")) return "generate";
		if (url.includes("mode=native")) return "native";
		return null;
	}
}
