import { extractImportUrl } from "../import/extract-import-url";
import type { CopilotBlockedFeature } from "../schemas/copilot";
import {
	NATIVE_FEATURE_HINTS,
	type NativeFeatureEnabledMap,
} from "./native-feature-hints.server";

export type CopilotBlockedIntent = CopilotBlockedFeature & {
	/** When false, native entry is killed — do not deep-link. */
	nativeAvailable: boolean;
};

const BLOCKED_FEATURES: Array<{
	feature: CopilotBlockedFeature["feature"];
	flag: keyof NativeFeatureEnabledMap;
	deepLink: string;
	message: string;
	unavailableMessage: string;
	patterns: RegExp[];
}> = [
	{
		feature: "scan",
		flag: "ai-scan-receipt",
		deepLink: NATIVE_FEATURE_HINTS.scan.deepLink,
		message: NATIVE_FEATURE_HINTS.scan.message,
		unavailableMessage:
			"Receipt scanning is temporarily unavailable. You can add Cargo items manually instead.",
		patterns: [
			/\bscan\b.*\b(receipt|image|photo|picture|barcode|camera)\b/i,
			/\b(image|photo|picture|camera)\b.*\b(receipt|scan|ocr)\b/i,
			/\bocr\b/i,
		],
	},
	{
		feature: "import_url",
		flag: "ai-import-url",
		deepLink: NATIVE_FEATURE_HINTS.import_url.deepLink,
		message: NATIVE_FEATURE_HINTS.import_url.message,
		unavailableMessage:
			"Recipe URL import is temporarily unavailable. You can add meals manually in Galley instead.",
		patterns: [
			/\b(import|pull|parse|extract)\b.*\b(url|link|website|recipe site)\b/i,
			/\b(import|pull|parse|extract)\b.*https?:\/\/\S+/i,
			/\bthis\s+(reel|tiktok|instagram|youtube)\b/i,
			/\b(tiktok|instagram|youtube|youtu\.be)\b.*\b(recipe|meal|dish)\b/i,
			/\b(recipe|meal|dish)\b.*\b(tiktok|instagram|youtube|reel)\b/i,
		],
	},
];

function matchesImportUrlBlock(text: string, patterns: RegExp[]): boolean {
	if (extractImportUrl(text)) return true;
	return patterns.some((pattern) => pattern.test(text));
}

export function detectBlockedCopilotIntent(
	input: string,
	enabled?: NativeFeatureEnabledMap,
): CopilotBlockedIntent | null {
	const text = input.trim();
	if (!text) return null;

	for (const blocked of BLOCKED_FEATURES) {
		const matched =
			blocked.feature === "import_url"
				? matchesImportUrlBlock(text, blocked.patterns)
				: blocked.patterns.some((pattern) => pattern.test(text));
		if (matched) {
			const nativeAvailable =
				enabled === undefined || enabled[blocked.flag] === true;
			return {
				feature: blocked.feature,
				deepLink: nativeAvailable ? blocked.deepLink : "",
				message: nativeAvailable ? blocked.message : blocked.unavailableMessage,
				nativeAvailable,
			};
		}
	}

	return null;
}
