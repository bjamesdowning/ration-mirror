/**
 * Extract the first HTTPS URL from free text and classify it for import routing.
 */

import {
	classifyImportUrl,
	type ImportSourceKind,
} from "./classify-import-url";

const HTTPS_URL_RE = /https:\/\/[^\s<>"')\]]+/i;

export type ExtractedImportUrl = {
	url: string;
	kind: ImportSourceKind;
};

function trimTrailingPunctuation(url: string): string {
	return url.replace(/[.,;:!?)]+$/u, "");
}

/** First `https://` URL in `text`, classified via {@link classifyImportUrl}. */
export function extractImportUrl(text: string): ExtractedImportUrl | null {
	const match = text.match(HTTPS_URL_RE);
	if (!match?.[0]) return null;
	const url = trimTrailingPunctuation(match[0]);
	if (!url.startsWith("https://")) return null;
	try {
		new URL(url);
	} catch {
		return null;
	}
	return { url, kind: classifyImportUrl(url) };
}
