/**
 * Classify import URLs into web vs social platforms for lane routing.
 */

export type ImportSourceKind =
	| "web"
	| "tiktok"
	| "youtube"
	| "instagram"
	| "photo";

export type SocialPlatform = "tiktok" | "youtube" | "instagram";

const TIKTOK_HOSTS = new Set([
	"tiktok.com",
	"www.tiktok.com",
	"vm.tiktok.com",
	"www.vm.tiktok.com",
	"m.tiktok.com",
]);

const YOUTUBE_HOSTS = new Set([
	"youtube.com",
	"www.youtube.com",
	"m.youtube.com",
	"youtu.be",
	"www.youtu.be",
	"music.youtube.com",
]);

const INSTAGRAM_HOSTS = new Set([
	"instagram.com",
	"www.instagram.com",
	"m.instagram.com",
]);

function hostnameOf(rawUrl: string): string | null {
	try {
		return new URL(rawUrl).hostname.toLowerCase().replace(/\.$/, "");
	} catch {
		return null;
	}
}

/** Map a URL to an import source kind (photo is never inferred from URL). */
export function classifyImportUrl(rawUrl: string): ImportSourceKind {
	const host = hostnameOf(rawUrl);
	if (!host) return "web";
	if (TIKTOK_HOSTS.has(host) || host.endsWith(".tiktok.com")) return "tiktok";
	if (YOUTUBE_HOSTS.has(host) || host.endsWith(".youtube.com"))
		return "youtube";
	if (INSTAGRAM_HOSTS.has(host) || host.endsWith(".instagram.com")) {
		return "instagram";
	}
	return "web";
}

export function isSocialImportKind(
	kind: ImportSourceKind,
): kind is SocialPlatform {
	return kind === "tiktok" || kind === "youtube" || kind === "instagram";
}

/** Flag key for a classified source (parent ai-import-url is separate). */
export function laneFlagForSource(
	kind: ImportSourceKind,
): "ai-import-web" | "ai-import-social" | "ai-import-photo" {
	if (kind === "photo") return "ai-import-photo";
	if (isSocialImportKind(kind)) return "ai-import-social";
	return "ai-import-web";
}
