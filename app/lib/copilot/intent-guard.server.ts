import type { CopilotBlockedFeature } from "../schemas/copilot";

export type CopilotBlockedIntent = CopilotBlockedFeature;

const BLOCKED_FEATURES: Array<{
	feature: CopilotBlockedFeature["feature"];
	deepLink: string;
	message: string;
	patterns: RegExp[];
}> = [
	{
		feature: "scan",
		deepLink: "ration://scan",
		message:
			"Receipt and visual scanning stay in the native Scan flow so credit use, camera permissions, and image handling remain explicit.",
		patterns: [
			/\bscan\b.*\b(receipt|image|photo|picture|barcode)\b/i,
			/\b(read|parse|process)\b.*\b(receipt|image|photo|picture)\b/i,
			/\bocr\b/i,
		],
	},
	{
		feature: "generate_meal",
		deepLink: "ration://galley/generate",
		message:
			"AI meal generation stays in Galley so recipe generation uses the existing credit gate and review flow.",
		patterns: [
			/\b(generate|create|make)\b.*\b(recipe|meal|dish)\b/i,
			/\bai\b.*\b(recipe|meal)\b/i,
		],
	},
	{
		feature: "import_url",
		deepLink: "ration://galley/import",
		message:
			"Recipe URL import stays in Galley so browser extraction and credit billing remain explicit.",
		patterns: [
			/\b(import|pull|parse|extract)\b.*\b(url|link|website|recipe site)\b/i,
			/\b(import|pull|parse|extract)\b.*https?:\/\/\S+/i,
		],
	},
	{
		feature: "plan_week",
		deepLink: "ration://manifest/plan-week",
		message:
			"AI week planning stays in Manifest so the existing planning credit gate and confirmation flow remain in control.",
		patterns: [
			/\b(plan|build|generate)\b.*\b(week|weekly)\b/i,
			/\bmeal plan\b/i,
			/\bmanifest\b.*\b(ai|plan)\b/i,
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
