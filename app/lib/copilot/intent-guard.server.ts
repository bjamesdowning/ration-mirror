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
			/\bscan\b.*\b(receipt|image|photo|picture|barcode)\b/i,
			/\b(read|parse|process)\b.*\b(receipt|image|photo|picture)\b/i,
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
		],
	},
];

export function detectBlockedCopilotIntent(
	input: string,
	enabled?: NativeFeatureEnabledMap,
): CopilotBlockedIntent | null {
	const text = input.trim();
	if (!text) return null;

	for (const blocked of BLOCKED_FEATURES) {
		if (blocked.patterns.some((pattern) => pattern.test(text))) {
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
