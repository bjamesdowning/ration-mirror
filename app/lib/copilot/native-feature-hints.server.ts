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
			"Website and social recipe URLs (Instagram, TikTok, YouTube) require Galley Import for extraction, credits, and review. Open Galley Import rather than creating a meal from the link in chat.",
	},
} as const;

export type NativeFeatureFlagKey =
	(typeof NATIVE_FEATURE_HINTS)[keyof typeof NATIVE_FEATURE_HINTS]["flag"];

/** Copilot no longer upsells billed Generate / Plan Week after acting. */
export type NativeFeatureSuggestion =
	(typeof NATIVE_FEATURE_HINTS)[keyof typeof NATIVE_FEATURE_HINTS];

export type NativeFeatureEnabledMap = Partial<
	Record<NativeFeatureFlagKey, boolean>
>;

export type NativeFeatureClientSource = "web" | "mobile";

function isHintEnabled(
	flag: NativeFeatureFlagKey,
	enabled?: NativeFeatureEnabledMap,
): boolean {
	if (!enabled) return true;
	return enabled[flag] === true;
}

/** Generate / Plan Week are fulfilled with kitchen primitives — no native upsell. */
export function detectNativeFeatureSuggestion(
	_input: string,
	_enabled?: NativeFeatureEnabledMap,
): NativeFeatureSuggestion | null {
	return null;
}

/** Prefer web routes for browser clients; deep links for iOS. */
export function resolveNativeFeatureLink(
	hint: { deepLink: string; webPath: string },
	source: NativeFeatureClientSource = "web",
): string {
	return source === "mobile" ? hint.deepLink : hint.webPath;
}

export function formatNativeFeatureAdvisory(
	_hint: NativeFeatureSuggestion,
	_source: NativeFeatureClientSource = "web",
): string {
	return "";
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
