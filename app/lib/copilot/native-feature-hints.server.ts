export const NATIVE_FEATURE_HINTS = {
	scan: {
		name: "Scan",
		deepLink: "ration://scan",
		message:
			"Receipt, label, and pantry photo scanning require Ration's native Scan flow for camera permissions, image handling, and explicit credit use.",
	},
	import_url: {
		name: "Galley Import",
		deepLink: "ration://galley/import",
		message:
			"Recipe URL import requires Galley Import for browser extraction, credit billing, and review.",
	},
	generate_meal: {
		name: "Galley Generate",
		deepLink: "ration://galley/generate",
		message:
			"Galley Generate provides Ration's dedicated AI recipe generator and review-before-save flow.",
	},
	plan_week: {
		name: "Manifest Plan Week",
		deepLink: "ration://manifest/plan-week",
		message:
			"Manifest Plan Week provides Ration's background AI planner with dietary and tag controls.",
	},
} as const;

export type NativeFeatureSuggestion =
	| typeof NATIVE_FEATURE_HINTS.generate_meal
	| typeof NATIVE_FEATURE_HINTS.plan_week;

const CHAT_PREFERENCE_PATTERN =
	/\b(in (?:this )?chat|through copilot|with copilot|just do it|continue (?:here|in (?:this )?chat))\b/i;

const NATIVE_FEATURE_SUGGESTIONS: Array<{
	hint: NativeFeatureSuggestion;
	patterns: RegExp[];
}> = [
	{
		hint: NATIVE_FEATURE_HINTS.generate_meal,
		patterns: [
			/\b(generate|create|make)\b.*\b(recipe|meal|dish)\b/i,
			/\bai\b.*\b(recipe|meal)\b/i,
		],
	},
	{
		hint: NATIVE_FEATURE_HINTS.plan_week,
		patterns: [
			/\b(plan|build|generate)\b.*\b(week|weekly)\b/i,
			/\b(create|make|build|plan|fill|schedule)\b.*\b(meal plan|manifest)\b/i,
			/\bmanifest\b.*\b(ai|plan)\b/i,
		],
	},
];

export function detectNativeFeatureSuggestion(
	input: string,
): NativeFeatureSuggestion | null {
	const text = input.trim();
	if (!text || CHAT_PREFERENCE_PATTERN.test(text)) return null;
	return (
		NATIVE_FEATURE_SUGGESTIONS.find(({ patterns }) =>
			patterns.some((pattern) => pattern.test(text)),
		)?.hint ?? null
	);
}

export function formatNativeFeatureGuidance(): string {
	return Object.values(NATIVE_FEATURE_HINTS)
		.map(
			(hint) => `- ${hint.name}: ${hint.message} Deep link: ${hint.deepLink}`,
		)
		.join("\n");
}
