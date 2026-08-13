/**
 * Acquire social post evidence (platform meta → Supadata metadata → native
 * transcript → ASR generate when the written caption is still thin).
 */

import {
	classifyImportUrl,
	isSocialImportKind,
	type SocialPlatform,
} from "~/lib/import/classify-import-url";
import { hasStrongRecipeSignal } from "~/lib/import/recipe-signal";
import {
	fetchMetadata,
	fetchTranscript,
	isSupadataUnavailable,
	SupadataError,
} from "~/lib/import/supadata.server";
import { log } from "~/lib/logging.server";
import {
	IMPORT_PROVIDER_UNAVAILABLE_CODE,
	IMPORT_PROVIDER_UNAVAILABLE_MESSAGE,
} from "~/lib/recipe-import-block.server";

export type SocialEvidence =
	| "oembed"
	| "description"
	| "supadata_metadata"
	| "transcript_native"
	| "transcript_asr"
	| "user_text";

export type SocialContent = {
	platform: SocialPlatform;
	canonicalUrl: string;
	title?: string;
	caption?: string;
	description?: string;
	transcript?: string;
	evidence: SocialEvidence[];
};

type SocialEnv = {
	SUPADATA_API_KEY?: string;
	YOUTUBE_DATA_API_KEY?: string;
	RATION_KV?: KVNamespace;
};

async function fetchTikTokOEmbed(
	url: string,
): Promise<{ title?: string; author?: string; canonicalUrl: string }> {
	const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 10_000);
	try {
		const response = await fetch(endpoint, {
			signal: controller.signal,
			headers: { Accept: "application/json" },
		});
		if (!response.ok) {
			throw new Error(`TikTok oEmbed ${response.status}`);
		}
		const json = (await response.json()) as {
			title?: string;
			author_name?: string;
			author_url?: string;
		};
		let canonicalUrl = url;
		try {
			const resolved = new URL(url);
			canonicalUrl = resolved.href;
		} catch {
			/* keep */
		}
		return {
			title: typeof json.title === "string" ? json.title : undefined,
			author:
				typeof json.author_name === "string" ? json.author_name : undefined,
			canonicalUrl,
		};
	} finally {
		clearTimeout(timeoutId);
	}
}

async function fetchYouTubeDescription(
	env: SocialEnv,
	url: string,
): Promise<{ title?: string; description?: string; canonicalUrl: string }> {
	const videoId = extractYouTubeId(url);
	const canonicalUrl = videoId
		? `https://www.youtube.com/watch?v=${videoId}`
		: url;

	const apiKey = env.YOUTUBE_DATA_API_KEY?.trim();
	if (apiKey && videoId) {
		const qs = new URLSearchParams({
			part: "snippet",
			id: videoId,
			key: apiKey,
		});
		const response = await fetch(
			`https://www.googleapis.com/youtube/v3/videos?${qs}`,
			{ headers: { Accept: "application/json" } },
		);
		if (response.ok) {
			const json = (await response.json()) as {
				items?: Array<{
					snippet?: { title?: string; description?: string };
				}>;
			};
			const snippet = json.items?.[0]?.snippet;
			if (snippet) {
				return {
					title: snippet.title,
					description: snippet.description,
					canonicalUrl,
				};
			}
		}
	}

	// Fallback: YouTube oEmbed (title only, free).
	try {
		const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`;
		const response = await fetch(oembedUrl, {
			headers: { Accept: "application/json" },
		});
		if (response.ok) {
			const json = (await response.json()) as { title?: string };
			return {
				title: typeof json.title === "string" ? json.title : undefined,
				canonicalUrl,
			};
		}
	} catch {
		/* ignore */
	}

	return { canonicalUrl };
}

function extractYouTubeId(url: string): string | null {
	try {
		const u = new URL(url);
		if (u.hostname === "youtu.be" || u.hostname === "www.youtu.be") {
			const id = u.pathname.replace(/^\//, "").split("/")[0];
			return id || null;
		}
		const v = u.searchParams.get("v");
		if (v) return v;
		const shorts = u.pathname.match(/\/shorts\/([^/?]+)/);
		if (shorts?.[1]) return shorts[1];
		return null;
	} catch {
		return null;
	}
}

function mergeText(parts: Array<string | undefined>): string {
	return parts
		.map((p) => p?.trim())
		.filter((p): p is string => Boolean(p && p.length > 0))
		.join("\n\n");
}

/** Prefer the longer non-empty string when merging metadata sources. */
function preferLonger(
	current: string | undefined,
	incoming: string | undefined,
): string | undefined {
	const a = current?.trim();
	const b = incoming?.trim();
	if (!b) return a || undefined;
	if (!a) return b;
	return b.length > a.length ? b : a;
}

function isTranscriptProductMiss(err: unknown): boolean {
	if (!(err instanceof SupadataError)) return false;
	if (err.code === "empty") return true;
	const status = err.status;
	return status === 206 || status === 404;
}

export function socialContentToPromptText(content: SocialContent): string {
	const blocks: string[] = [
		`platform: ${content.platform}`,
		`source_url: ${content.canonicalUrl}`,
	];
	if (content.title) blocks.push(`title:\n${content.title}`);
	if (content.caption) blocks.push(`caption:\n${content.caption}`);
	if (content.description) blocks.push(`description:\n${content.description}`);
	if (content.transcript) blocks.push(`transcript:\n${content.transcript}`);
	blocks.push(`evidence: ${content.evidence.join(", ") || "none"}`);
	return `<social_content>\n${blocks.join("\n\n")}\n</social_content>`;
}

export type AcquireSocialOptions = {
	/** Optional caption/text provided by the client (e.g. Instagram share). */
	userText?: string;
	/** When false, skip paid ASR generate after a native miss. Default true. */
	enableAsr?: boolean;
};

/**
 * Hybrid acquire: free platform meta → Supadata metadata → native transcript
 * when thin → ASR generate when native is missing or still thin.
 * Both metadata and transcript (when present) feed Gemini via socialContentToPromptText.
 */
export async function acquireSocialContent(
	env: SocialEnv,
	url: string,
	options?: AcquireSocialOptions,
): Promise<
	| { ok: true; content: SocialContent }
	| { ok: false; error: string; code?: string; softFailToPhoto?: boolean }
> {
	const kind = classifyImportUrl(url);
	if (!isSocialImportKind(kind)) {
		return { ok: false, error: "Not a social media URL.", code: "NOT_SOCIAL" };
	}

	const evidence: SocialEvidence[] = [];
	let title: string | undefined;
	let caption: string | undefined;
	let description: string | undefined;
	let canonicalUrl = url;
	const hasUserText = Boolean(options?.userText?.trim());
	const enableAsr = options?.enableAsr !== false;

	if (hasUserText) {
		caption = options?.userText?.trim();
		evidence.push("user_text");
	}

	try {
		if (kind === "tiktok") {
			const oembed = await fetchTikTokOEmbed(url);
			canonicalUrl = oembed.canonicalUrl;
			if (oembed.title) {
				title = oembed.title;
				if (!hasUserText) caption = oembed.title;
				evidence.push("oembed");
			}
		} else if (kind === "youtube") {
			const yt = await fetchYouTubeDescription(env, url);
			canonicalUrl = yt.canonicalUrl;
			title = yt.title;
			description = yt.description;
			if (yt.title || yt.description) evidence.push("description");
		} else if (kind === "instagram") {
			// No Meta oEmbed — user text or Supadata metadata/transcript.
			canonicalUrl = url;
		}
	} catch (err) {
		log.warn("social_metadata_fetch_failed", {
			platform: kind,
			error: err instanceof Error ? err.message : "unknown",
		});
	}

	// Supadata unified metadata (title + description) — critical for TikTok/IG captions.
	try {
		const meta = await fetchMetadata(env, canonicalUrl);
		if (meta.url) canonicalUrl = meta.url;
		const hadTitleOrDescription = Boolean(meta.title || meta.description);
		if (hadTitleOrDescription) {
			title = preferLonger(title, meta.title);
			description = preferLonger(description, meta.description);
			evidence.push("supadata_metadata");
		}
	} catch (err) {
		log.warn("social_supadata_metadata_failed", {
			platform: kind,
			error: err instanceof Error ? err.message : "unknown",
			unavailable: isSupadataUnavailable(err),
		});
	}

	const signalText = mergeText([title, caption, description]);
	let transcript: string | undefined;

	if (!hasStrongRecipeSignal(signalText)) {
		const transcriptFail = await fetchSocialTranscripts({
			env,
			canonicalUrl,
			kind,
			enableAsr,
			onNative: (text) => {
				transcript = text;
				evidence.push("transcript_native");
			},
			onAsr: (text) => {
				transcript = preferLonger(transcript, text);
				if (!evidence.includes("transcript_asr")) {
					evidence.push("transcript_asr");
				}
			},
		});
		if (transcriptFail) return transcriptFail;
	}

	const content: SocialContent = {
		platform: kind,
		canonicalUrl,
		title,
		caption,
		description,
		transcript,
		evidence,
	};

	const promptPreview = socialContentToPromptText(content);
	if (promptPreview.replace(/\s/g, "").length < 80) {
		return {
			ok: false,
			error:
				"Not enough recipe text on this post. Try a screenshot of the ingredients.",
			code: "CONTENT_TOO_SHORT",
			softFailToPhoto: true,
		};
	}

	return { ok: true, content };
}

async function fetchSocialTranscripts(args: {
	env: SocialEnv;
	canonicalUrl: string;
	kind: SocialPlatform;
	enableAsr: boolean;
	onNative: (text: string) => void;
	onAsr: (text: string) => void;
}): Promise<
	| { ok: false; error: string; code?: string; softFailToPhoto?: boolean }
	| undefined
> {
	const { env, canonicalUrl, kind, enableAsr, onNative, onAsr } = args;
	let nativeText: string | undefined;
	let nativeMiss = false;

	try {
		const result = await fetchTranscript(env, canonicalUrl, {
			mode: "native",
		});
		nativeText = result.text;
		onNative(result.text);
	} catch (err) {
		const code = err instanceof SupadataError ? err.code : undefined;
		log.warn("social_transcript_failed", {
			platform: kind,
			mode: "native",
			code,
			error: err instanceof Error ? err.message : "unknown",
			unavailable: isSupadataUnavailable(err),
		});

		if (!isTranscriptProductMiss(err)) {
			if (isSupadataUnavailable(err)) {
				return {
					ok: false,
					error: IMPORT_PROVIDER_UNAVAILABLE_MESSAGE,
					code: IMPORT_PROVIDER_UNAVAILABLE_CODE,
					softFailToPhoto: true,
				};
			}
			return {
				ok: false,
				error:
					kind === "instagram"
						? "Could not read this Instagram post. Try a screenshot of the recipe."
						: "Could not extract recipe text from this video. Try a screenshot or a different link.",
				code: "SOCIAL_CONTENT_EMPTY",
				softFailToPhoto: true,
			};
		}
		nativeMiss = true;
	}

	const nativeIsStrong = Boolean(
		nativeText && hasStrongRecipeSignal(nativeText),
	);
	if (!enableAsr || nativeIsStrong) return undefined;

	try {
		const result = await fetchTranscript(env, canonicalUrl, {
			mode: "generate",
		});
		onAsr(result.text);
	} catch (err) {
		const code = err instanceof SupadataError ? err.code : undefined;
		log.warn("social_transcript_failed", {
			platform: kind,
			mode: "generate",
			code,
			error: err instanceof Error ? err.message : "unknown",
			unavailable: isSupadataUnavailable(err),
		});

		if (isTranscriptProductMiss(err)) {
			return undefined;
		}
		if (isSupadataUnavailable(err)) {
			// Native text may still be enough; only fail hard when we had nothing.
			if (nativeMiss && !nativeText) {
				return {
					ok: false,
					error: IMPORT_PROVIDER_UNAVAILABLE_MESSAGE,
					code: IMPORT_PROVIDER_UNAVAILABLE_CODE,
					softFailToPhoto: true,
				};
			}
			return undefined;
		}
		if (nativeMiss && !nativeText) {
			return {
				ok: false,
				error:
					kind === "instagram"
						? "Could not read this Instagram post. Try a screenshot of the recipe."
						: "Could not extract recipe text from this video. Try a screenshot or a different link.",
				code: "SOCIAL_CONTENT_EMPTY",
				softFailToPhoto: true,
			};
		}
	}

	return undefined;
}
