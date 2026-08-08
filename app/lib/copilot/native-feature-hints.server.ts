export const NATIVE_FEATURE_HINTS = {
	scan: {
		name: "Scan",
		deepLink: "ration://scan",
		webPath: "/hub/cargo",
		flag: "ai-scan-receipt" as const,
		message:
			"Receipt, label, and pantry photo scanning require Ration's native Scan flow for camera permissions, image handling, and explicit credit use.",
	},
	import_url: {
		name: "Galley Import",
		deepLink: "ration://galley/import",
		webPath: "/hub/galley",
		flag: "ai-import-url" as const,
		message:
			"Recipe URL import requires Galley Import for browser extraction, credit billing, and review.",
	},
	generate_meal: {
		name: "Galley Generate",
		deepLink: "ration://galley/generate",
		webPath: "/hub/galley",
		flag: "ai-generate-meal" as const,
		message:
			"Galley Generate provides Ration's dedicated AI recipe generator and review-before-save flow.",
	},
	plan_week: {
		name: "Manifest Plan Week",
		deepLink: "ration://manifest/plan-week",
		webPath: "/hub/manifest",
		flag: "ai-plan-week" as const,
		message:
			"Manifest Plan Week provides Ration's background AI planner with dietary and tag controls.",
	},
} as const;

export type NativeFeatureFlagKey =
	(typeof NATIVE_FEATURE_HINTS)[keyof typeof NATIVE_FEATURE_HINTS]["flag"];

export type NativeFeatureSuggestion =
	| typeof NATIVE_FEATURE_HINTS.generate_meal
	| typeof NATIVE_FEATURE_HINTS.plan_week;

export type NativeFeatureEnabledMap = Partial<
	Record<NativeFeatureFlagKey, boolean>
>;

export type NativeFeatureClientSource = "web" | "mobile";

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

function isHintEnabled(
	flag: NativeFeatureFlagKey,
	enabled?: NativeFeatureEnabledMap,
): boolean {
	if (!enabled) return true;
	return enabled[flag] === true;
}

export function detectNativeFeatureSuggestion(
	input: string,
	enabled?: NativeFeatureEnabledMap,
): NativeFeatureSuggestion | null {
	const text = input.trim();
	if (!text || CHAT_PREFERENCE_PATTERN.test(text)) return null;
	const match = NATIVE_FEATURE_SUGGESTIONS.find(({ patterns }) =>
		patterns.some((pattern) => pattern.test(text)),
	);
	if (!match) return null;
	if (!isHintEnabled(match.hint.flag, enabled)) return null;
	return match.hint;
}

/** Prefer web routes for browser clients; deep links for iOS. */
export function resolveNativeFeatureLink(
	hint: { deepLink: string; webPath: string },
	source: NativeFeatureClientSource = "web",
): string {
	return source === "mobile" ? hint.deepLink : hint.webPath;
}

/**
 * Act-first advisory appended per turn when a native AI feature overlaps.
 * Tools stay available; disclosure is post-action only.
 */
export function formatNativeFeatureAdvisory(
	hint: NativeFeatureSuggestion,
	source: NativeFeatureClientSource = "web",
): string {
	const link = resolveNativeFeatureLink(hint, source);
	return (
		`\n\nThe user's request overlaps ${hint.name}. You MUST complete all requested actions with tools in this turn. ` +
		`Only after your final action summary, add one sentence noting the native alternative and its benefit, with this link: ${link}.`
	);
}

export function formatNativeFeatureGuidance(
	enabled?: NativeFeatureEnabledMap,
): string {
	return Object.values(NATIVE_FEATURE_HINTS)
		.filter((hint) => isHintEnabled(hint.flag, enabled))
		.map(
			(hint) =>
				`- ${hint.name}: ${hint.message} Deep link: ${hint.deepLink} Web path: ${hint.webPath}`,
		)
		.join("\n");
}
