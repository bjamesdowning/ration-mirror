import type { CopilotBlockedFeature } from "../schemas/copilot";
import { NATIVE_FEATURE_HINTS } from "./native-feature-hints.server";

export type CopilotBlockedIntent = CopilotBlockedFeature;

const BLOCKED_FEATURES: Array<{
	feature: CopilotBlockedFeature["feature"];
	deepLink: string;
	message: string;
	patterns: RegExp[];
}> = [
	{
		feature: "scan",
		deepLink: NATIVE_FEATURE_HINTS.scan.deepLink,
		message: NATIVE_FEATURE_HINTS.scan.message,
		patterns: [
			/\bscan\b.*\b(receipt|image|photo|picture|barcode)\b/i,
			/\b(read|parse|process)\b.*\b(receipt|image|photo|picture)\b/i,
			/\bocr\b/i,
		],
	},
	{
		feature: "import_url",
		deepLink: NATIVE_FEATURE_HINTS.import_url.deepLink,
		message: NATIVE_FEATURE_HINTS.import_url.message,
		patterns: [
			/\b(import|pull|parse|extract)\b.*\b(url|link|website|recipe site)\b/i,
			/\b(import|pull|parse|extract)\b.*https?:\/\/\S+/i,
		],
	},
];

export function detectBlockedCopilotIntent(
	input: string,
): CopilotBlockedIntent | null {
	const text = input.trim();
	if (!text) return null;

	for (const blocked of BLOCKED_FEATURES) {
		if (blocked.patterns.some((pattern) => pattern.test(text))) {
			return {
				feature: blocked.feature,
				deepLink: blocked.deepLink,
				message: blocked.message,
			};
		}
	}

	return null;
}
