import { log } from "./logging.server";

const BROWSER_RENDERING_TIMEOUT_MS = 45_000;
const BR_API_BASE = "https://api.cloudflare.com/client/v4/accounts";

/** Minimum content length to consider markdown usable for recipe extraction. */
export const MIN_CONTENT_LENGTH = 200;

/**
 * Fetch a URL via Cloudflare Browser Rendering Markdown API.
 * Renders JavaScript-heavy pages and returns clean Markdown.
 *
 * Requires CF_BROWSER_RENDERING_TOKEN (wrangler secret) and AI_GATEWAY_ACCOUNT_ID.
 * Throws on error; caller should catch and fall back to plain fetch.
 */
export async function fetchPageAsMarkdown(
	url: string,
	env: Pick<Env, "AI_GATEWAY_ACCOUNT_ID" | "CF_BROWSER_RENDERING_TOKEN">,
): Promise<string> {
	const token = env.CF_BROWSER_RENDERING_TOKEN;
	const accountId = env.AI_GATEWAY_ACCOUNT_ID;

	if (!token || token.trim() === "") {
		throw new Error("CF_BROWSER_RENDERING_TOKEN not configured");
	}
	if (!accountId || accountId.trim() === "") {
		throw new Error("AI_GATEWAY_ACCOUNT_ID not configured");
	}

	const apiUrl = `${BR_API_BASE}/${accountId}/browser-rendering/markdown`;

	const controller = new AbortController();
	const timeoutId = setTimeout(
		() => controller.abort(),
		BROWSER_RENDERING_TIMEOUT_MS,
	);

	try {
		const response = await fetch(apiUrl, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				url,
				gotoOptions: { waitUntil: "networkidle0" },
				rejectRequestPattern: ["/^.*\\.(css|png|jpg|jpeg|gif|webp|woff2?)$/"],
			}),
			signal: controller.signal,
		});
		clearTimeout(timeoutId);

		if (!response.ok) {
			await response.text(); // Consume body
			log.warn("Browser Rendering API error", {
				status: response.status,
				statusText: response.statusText,
			});
			throw new Error(
				`Browser Rendering API failed: ${response.status} ${response.statusText}`,
			);
		}

		const json = (await response.json()) as {
			success?: boolean;
			result?: string;
			errors?: unknown[];
		};

		if (!json.success || typeof json.result !== "string") {
			log.warn("Browser Rendering API invalid response", {
				hasResult: typeof json.result === "string",
				errors: json.errors,
			});
			throw new Error("Browser Rendering API returned invalid response");
		}

		const browserMsUsed = response.headers.get("X-Browser-Ms-Used");
		if (browserMsUsed) {
			log.info("recipe_import_browser_rendering", {
				url: new URL(url).hostname,
				browserMsUsed: Number.parseInt(browserMsUsed, 10),
			});
		}

		return json.result;
	} catch (err) {
		clearTimeout(timeoutId);
		if (err instanceof Error && err.name === "AbortError") {
			throw new Error("Browser Rendering request timed out");
		}
		throw err;
	}
}
