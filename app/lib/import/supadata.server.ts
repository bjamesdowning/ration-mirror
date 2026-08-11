/**
 * Thin Supadata REST client for web scrape + social transcripts.
 * Called only from queue consumers — never from the browser.
 * @see https://docs.supadata.ai/
 */

import { log } from "~/lib/logging.server";

const SUPADATA_BASE = "https://api.supadata.ai/v1";
const DEFAULT_TIMEOUT_MS = 45_000;
const TRANSCRIPT_POLL_MS = 2_000;
const TRANSCRIPT_POLL_MAX = 30;

export class SupadataError extends Error {
	constructor(
		message: string,
		readonly code?: string,
		readonly status?: number,
	) {
		super(message);
		this.name = "SupadataError";
	}
}

/**
 * True when Supadata cannot be used (missing key, auth, timeout, 5xx, network).
 * Empty content / 4xx "not found" are product misses, not provider outages.
 */
export function isSupadataUnavailable(err: unknown): boolean {
	if (!(err instanceof SupadataError)) {
		// AbortError / TypeError / fetch failures
		return true;
	}
	if (
		err.code === "config" ||
		err.code === "timeout" ||
		err.code === "job" ||
		err.code === "failed"
	) {
		return true;
	}
	const status = err.status;
	if (status == null) return false;
	if (status === 401 || status === 403 || status === 429) return true;
	if (status >= 500) return true;
	return false;
}

type SupadataEnv = {
	SUPADATA_API_KEY?: string;
	RATION_KV?: KVNamespace;
};

function requireApiKey(env: SupadataEnv): string {
	const key = env.SUPADATA_API_KEY?.trim();
	if (!key) {
		throw new SupadataError("SUPADATA_API_KEY not configured", "config");
	}
	return key;
}

async function supadataFetch(
	env: SupadataEnv,
	path: string,
	init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
	const apiKey = requireApiKey(env);
	const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(`${SUPADATA_BASE}${path}`, {
			...init,
			signal: controller.signal,
			headers: {
				"x-api-key": apiKey,
				Accept: "application/json",
				...(init?.headers ?? {}),
			},
		});
	} finally {
		clearTimeout(timeoutId);
	}
}

export type SupadataScrapeResult = {
	url: string;
	content: string;
	name?: string;
	description?: string;
};

/** Scrape a webpage to Markdown (1 Supadata credit). */
export async function scrapeWebPage(
	env: SupadataEnv,
	url: string,
): Promise<SupadataScrapeResult> {
	const qs = new URLSearchParams({ url });
	let response: Response;
	try {
		response = await supadataFetch(env, `/web/scrape?${qs}`);
	} catch (err) {
		if (err instanceof Error && err.name === "AbortError") {
			throw new SupadataError("Supadata scrape timed out", "timeout");
		}
		throw err;
	}

	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as {
			error?: string;
			message?: string;
		} | null;
		throw new SupadataError(
			body?.message ?? `Supadata scrape failed (${response.status})`,
			body?.error,
			response.status,
		);
	}

	const json = (await response.json()) as {
		url?: string;
		content?: string;
		name?: string;
		description?: string;
	};
	if (typeof json.content !== "string" || json.content.trim().length === 0) {
		throw new SupadataError("Supadata returned empty scrape content", "empty");
	}

	return {
		url: typeof json.url === "string" ? json.url : url,
		content: json.content,
		name: typeof json.name === "string" ? json.name : undefined,
		description:
			typeof json.description === "string" ? json.description : undefined,
	};
}

export type SupadataTranscriptResult = {
	text: string;
	lang?: string;
};

function extractTranscriptText(payload: unknown): string | null {
	if (!payload || typeof payload !== "object") return null;
	const obj = payload as Record<string, unknown>;
	if (typeof obj.content === "string" && obj.content.trim()) {
		return obj.content.trim();
	}
	if (typeof obj.text === "string" && obj.text.trim()) {
		return obj.text.trim();
	}
	if (Array.isArray(obj.content)) {
		const parts = obj.content
			.map((chunk) => {
				if (typeof chunk === "string") return chunk;
				if (chunk && typeof chunk === "object" && "text" in chunk) {
					const t = (chunk as { text?: unknown }).text;
					return typeof t === "string" ? t : "";
				}
				return "";
			})
			.filter(Boolean);
		const joined = parts.join(" ").trim();
		return joined.length > 0 ? joined : null;
	}
	return null;
}

async function pollTranscriptJob(
	env: SupadataEnv,
	jobId: string,
): Promise<SupadataTranscriptResult> {
	for (let i = 0; i < TRANSCRIPT_POLL_MAX; i++) {
		const response = await supadataFetch(
			env,
			`/transcript/${encodeURIComponent(jobId)}`,
			{ timeoutMs: 15_000 },
		);
		if (!response.ok) {
			const body = (await response.json().catch(() => null)) as {
				error?: string;
				message?: string;
			} | null;
			throw new SupadataError(
				body?.message ?? `Supadata transcript job failed (${response.status})`,
				body?.error,
				response.status,
			);
		}
		const json = (await response.json()) as {
			status?: string;
			content?: unknown;
			error?: string;
		};
		if (json.status === "completed" || json.status === "done") {
			const text = extractTranscriptText(json);
			if (!text) {
				throw new SupadataError("Supadata transcript empty", "empty");
			}
			return { text };
		}
		if (json.status === "failed") {
			throw new SupadataError(
				json.error ?? "Supadata transcript job failed",
				"failed",
			);
		}
		await new Promise((r) => setTimeout(r, TRANSCRIPT_POLL_MS));
	}
	throw new SupadataError("Supadata transcript job timed out", "timeout");
}

const TRANSCRIPT_CACHE_TTL_SEC = 86_400;
const TRANSCRIPT_CACHE_PREFIX = "supadata:transcript:";

function cacheKeyForUrl(url: string): string {
	return `${TRANSCRIPT_CACHE_PREFIX}${encodeURIComponent(url)}`;
}

/** Fetch transcript for a social/video URL (native or AI generate via mode=auto). */
export async function fetchTranscript(
	env: SupadataEnv,
	url: string,
	options?: { mode?: "native" | "auto" | "generate"; skipCache?: boolean },
): Promise<SupadataTranscriptResult> {
	const mode = options?.mode ?? "auto";
	const kv = env.RATION_KV;

	if (kv && !options?.skipCache) {
		try {
			const cached = await kv.get(cacheKeyForUrl(url));
			if (cached) {
				return { text: cached };
			}
		} catch {
			/* ignore cache read errors */
		}
	}

	const qs = new URLSearchParams({
		url,
		text: "true",
		mode,
	});

	let response: Response;
	try {
		response = await supadataFetch(env, `/transcript?${qs}`);
	} catch (err) {
		if (err instanceof Error && err.name === "AbortError") {
			throw new SupadataError("Supadata transcript timed out", "timeout");
		}
		throw err;
	}

	if (response.status === 202) {
		const body = (await response.json()) as { jobId?: string };
		if (!body.jobId) {
			throw new SupadataError("Supadata returned 202 without jobId", "job");
		}
		log.info("supadata_transcript_async", { host: safeHost(url) });
		const result = await pollTranscriptJob(env, body.jobId);
		await cacheTranscript(kv, url, result.text);
		return result;
	}

	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as {
			error?: string;
			message?: string;
			jobId?: string;
		} | null;
		if (body?.jobId) {
			const result = await pollTranscriptJob(env, body.jobId);
			await cacheTranscript(kv, url, result.text);
			return result;
		}
		throw new SupadataError(
			body?.message ?? `Supadata transcript failed (${response.status})`,
			body?.error,
			response.status,
		);
	}

	const json = (await response.json()) as unknown;
	if (json && typeof json === "object" && "jobId" in json) {
		const jobId = (json as { jobId?: string }).jobId;
		if (jobId) {
			const result = await pollTranscriptJob(env, jobId);
			await cacheTranscript(kv, url, result.text);
			return result;
		}
	}

	const text = extractTranscriptText(json);
	if (!text) {
		throw new SupadataError("Supadata transcript empty", "empty");
	}

	await cacheTranscript(kv, url, text);
	return { text };
}

async function cacheTranscript(
	kv: KVNamespace | undefined,
	url: string,
	text: string,
): Promise<void> {
	if (!kv) return;
	try {
		await kv.put(cacheKeyForUrl(url), text, {
			expirationTtl: TRANSCRIPT_CACHE_TTL_SEC,
		});
	} catch {
		/* ignore */
	}
}

function safeHost(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return "unknown";
	}
}
