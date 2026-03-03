import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	fetchPageAsMarkdown,
	MIN_CONTENT_LENGTH,
} from "~/lib/browser-rendering.server";

const MOCK_ENV = {
	AI_GATEWAY_ACCOUNT_ID: "841fa4c177353aa4844f0c7439b59f86",
	CF_BROWSER_RENDERING_TOKEN: "mock-br-token",
} as Pick<Env, "AI_GATEWAY_ACCOUNT_ID" | "CF_BROWSER_RENDERING_TOKEN">;

describe("fetchPageAsMarkdown", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: () =>
					Promise.resolve({
						success: true,
						result: "# Recipe Title\n\nInstructions here.",
					}),
			}),
		);
	});

	it("returns markdown on 200 success", async () => {
		const result = await fetchPageAsMarkdown(
			"https://example.com/recipe",
			MOCK_ENV,
		);
		expect(result).toBe("# Recipe Title\n\nInstructions here.");
	});

	it("calls API with correct URL and body", async () => {
		await fetchPageAsMarkdown("https://example.com/recipe", MOCK_ENV);
		const fetchFn = vi.mocked(globalThis.fetch);
		expect(fetchFn).toHaveBeenCalledTimes(1);
		const [url, options] = fetchFn.mock.calls[0] ?? [];
		expect(url).toContain("/browser-rendering/markdown");
		expect(url).toContain(MOCK_ENV.AI_GATEWAY_ACCOUNT_ID);
		expect(options?.method).toBe("POST");
		const headers = options?.headers as
			| Headers
			| Record<string, string>
			| undefined;
		const auth =
			headers instanceof Headers
				? headers.get("Authorization")
				: (headers as Record<string, string>)?.Authorization;
		expect(auth).toMatch(/^Bearer .+$/);
		const body = JSON.parse((options?.body as string) ?? "{}");
		expect(body.url).toBe("https://example.com/recipe");
		expect(body.gotoOptions?.waitUntil).toBe("networkidle0");
	});

	it("does not include token in error messages", async () => {
		vi.mocked(globalThis.fetch).mockResolvedValue({
			ok: false,
			status: 401,
			headers: new Headers(),
			text: () => Promise.resolve("Unauthorized"),
		} as Response);

		try {
			await fetchPageAsMarkdown("https://example.com/recipe", MOCK_ENV);
		} catch (err) {
			expect(String(err)).not.toContain("mock-br-token");
			expect(String(err)).toMatch(/Browser Rendering API failed/);
			return;
		}
		expect.fail("Expected fetchPageAsMarkdown to throw");
	});

	it("throws when CF_BROWSER_RENDERING_TOKEN is empty", async () => {
		await expect(
			fetchPageAsMarkdown("https://example.com/recipe", {
				...MOCK_ENV,
				CF_BROWSER_RENDERING_TOKEN: "",
			}),
		).rejects.toThrow("CF_BROWSER_RENDERING_TOKEN not configured");
	});

	it("throws when CF_BROWSER_RENDERING_TOKEN is undefined", async () => {
		await expect(
			fetchPageAsMarkdown("https://example.com/recipe", {
				AI_GATEWAY_ACCOUNT_ID: MOCK_ENV.AI_GATEWAY_ACCOUNT_ID,
			}),
		).rejects.toThrow("CF_BROWSER_RENDERING_TOKEN not configured");
	});

	it("throws when AI_GATEWAY_ACCOUNT_ID is empty", async () => {
		const envWithoutAccountId = {
			...MOCK_ENV,
			AI_GATEWAY_ACCOUNT_ID: "",
		} as unknown as Pick<
			Env,
			"AI_GATEWAY_ACCOUNT_ID" | "CF_BROWSER_RENDERING_TOKEN"
		>;
		await expect(
			fetchPageAsMarkdown("https://example.com/recipe", envWithoutAccountId),
		).rejects.toThrow("AI_GATEWAY_ACCOUNT_ID not configured");
	});

	it("throws on 4xx response", async () => {
		vi.mocked(globalThis.fetch).mockResolvedValue({
			ok: false,
			status: 422,
			statusText: "Unprocessable Entity",
			headers: new Headers(),
			text: () => Promise.resolve(""),
		} as Response);

		await expect(
			fetchPageAsMarkdown("https://example.com/recipe", MOCK_ENV),
		).rejects.toThrow(/422 Unprocessable Entity/);
	});

	it("throws on 5xx response", async () => {
		vi.mocked(globalThis.fetch).mockResolvedValue({
			ok: false,
			status: 503,
			statusText: "Service Unavailable",
			headers: new Headers(),
			text: () => Promise.resolve(""),
		} as Response);

		await expect(
			fetchPageAsMarkdown("https://example.com/recipe", MOCK_ENV),
		).rejects.toThrow(/503 Service Unavailable/);
	});

	it("throws when API returns success: false", async () => {
		vi.mocked(globalThis.fetch).mockResolvedValue({
			ok: true,
			status: 200,
			headers: new Headers(),
			json: () =>
				Promise.resolve({
					success: false,
					errors: [{ message: "Invalid URL" }],
				}),
		} as Response);

		await expect(
			fetchPageAsMarkdown("https://example.com/recipe", MOCK_ENV),
		).rejects.toThrow("invalid response");
	});

	it("throws when result is not a string", async () => {
		vi.mocked(globalThis.fetch).mockResolvedValue({
			ok: true,
			status: 200,
			headers: new Headers(),
			json: () => Promise.resolve({ success: true, result: null }),
		} as Response);

		await expect(
			fetchPageAsMarkdown("https://example.com/recipe", MOCK_ENV),
		).rejects.toThrow("invalid response");
	});
});

describe("MIN_CONTENT_LENGTH", () => {
	it("is 200", () => {
		expect(MIN_CONTENT_LENGTH).toBe(200);
	});
});
