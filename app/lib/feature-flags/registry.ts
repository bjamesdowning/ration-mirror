export type FlagRegistryEntry = {
	defaultEnabled: boolean;
	description: string;
	/** When true, exposed via root loader `clientFlags` (camelCase `clientKey` or flag key). */
	clientVisible?: boolean;
	/** camelCase key for React loaders; defaults to flag key with hyphens removed. */
	clientKey?: string;
};

/** Add entries when gating a feature. Keys must match Flagship dashboard (kebab-case). */
export const FLAG_REGISTRY: Record<string, FlagRegistryEntry> = {
	"apple-web-login": {
		defaultEnabled: false,
		description: "Sign in with Apple on web",
		clientVisible: true,
		clientKey: "appleWebLogin",
	},
	"ration-copilot": {
		defaultEnabled: false,
		description: "Native Ration Copilot chat on web and iOS",
		clientVisible: true,
		clientKey: "rationCopilot",
	},
	"copilot-onboarding-free": {
		defaultEnabled: false,
		description:
			"One-time iOS Ask Ration welcome briefing (intro + starter kitchen seed) for new users",
	},
	"ai-import-url": {
		defaultEnabled: false,
		description: "AI recipe import parent switch (web / social / photo lanes)",
		clientVisible: true,
		clientKey: "aiImportUrl",
	},
	"ai-import-web": {
		defaultEnabled: false,
		description:
			"Website recipe import (plain fetch + Supadata scrape + client assist)",
		clientVisible: true,
		clientKey: "aiImportWeb",
	},
	"ai-import-social": {
		defaultEnabled: false,
		description:
			"Social URL import (TikTok / Instagram / YouTube via metadata + Supadata)",
		clientVisible: true,
		clientKey: "aiImportSocial",
	},
	"ai-import-photo": {
		defaultEnabled: false,
		description: "Screenshot / photo recipe import (Gemini vision)",
		clientVisible: true,
		clientKey: "aiImportPhoto",
	},
	"ai-scan-receipt": {
		defaultEnabled: false,
		description: "AI receipt / pantry vision scan (Cargo + Dock spend)",
		clientVisible: true,
		clientKey: "aiScanReceipt",
	},
	"ai-dock-from-receipt": {
		defaultEnabled: false,
		description: "Supply dock-from-receipt entry (match/complete)",
		clientVisible: true,
		clientKey: "aiDockFromReceipt",
	},
	"ai-generate-meal": {
		defaultEnabled: false,
		description: "AI meal generation",
		clientVisible: true,
		clientKey: "aiGenerateMeal",
	},
	"ai-plan-week": {
		defaultEnabled: false,
		description: "AI weekly meal planner",
		clientVisible: true,
		clientKey: "aiPlanWeek",
	},
	"app-review-login": {
		defaultEnabled: false,
		description: "App Store / TestFlight review email+password login on iOS",
		clientVisible: true,
		clientKey: "appReviewLogin",
	},
	"nutrition-engine": {
		defaultEnabled: false,
		description:
			"USDA nutrition resolve, recipe/cargo snapshots, and Galley panel",
		clientVisible: true,
		clientKey: "nutritionEngine",
	},
	"nutrition-ai-estimate": {
		defaultEnabled: false,
		description:
			"AI nutrient estimates on AI ingest paths when USDA resolve misses",
		clientVisible: true,
		clientKey: "nutritionAiEstimate",
	},
	"nutrition-manifest": {
		defaultEnabled: false,
		description: "Manifest daily nutrition totals and intake logging",
		clientVisible: true,
		clientKey: "nutritionManifest",
	},
	"nutrition-goals": {
		defaultEnabled: false,
		description: "Personal nutrition goals and vs-goal views",
		clientVisible: true,
		clientKey: "nutritionGoals",
	},
	"nutrition-cook-log-split": {
		defaultEnabled: false,
		description:
			"Separate Manifest Cook (shared) from Log my serving (private intake)",
		clientVisible: true,
		clientKey: "nutritionCookLogSplit",
	},
	"cargo-quick-eat": {
		defaultEnabled: false,
		description:
			"Cargo Quick Eat: snack on Manifest with best-effort pantry deduct + optional intake",
		clientVisible: true,
		clientKey: "cargoQuickEat",
	},
	"nutrition-intake-notes": {
		defaultEnabled: false,
		description:
			"Optional private notes (≤280 chars) on Manifest Eat / Quick Eat intake logs",
		clientVisible: true,
		clientKey: "nutritionIntakeNotes",
	},
	"nutrition-cross-org-diary": {
		defaultEnabled: false,
		description:
			"Personal intake summary/history aggregates across all kitchens for the signed-in user",
		clientVisible: true,
		clientKey: "nutritionCrossOrgDiary",
	},
	"nutrition-async-recompute": {
		defaultEnabled: false,
		description:
			"Async queue-backed meal nutrition recompute (requires NUTRITION_RECOMPUTE_QUEUE)",
	},
	"feature-enablement-consent": {
		defaultEnabled: false,
		description:
			"Feature enablement onboarding (AI + Macro Tracking) and web AI consent parity gate",
		clientVisible: true,
		clientKey: "featureEnablementConsent",
	},
};

/** Registry keys — narrows as entries are added to FLAG_REGISTRY. */
export type FlagKey = keyof typeof FLAG_REGISTRY & string;

const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function isValidFlagKey(key: string): boolean {
	return KEBAB_CASE.test(key);
}

export function assertRegistryDefaults(): void {
	for (const [key, entry] of Object.entries(FLAG_REGISTRY)) {
		if (!isValidFlagKey(key)) {
			throw new Error(`Invalid flag key "${key}": use kebab-case`);
		}
		if (entry.defaultEnabled !== false) {
			throw new Error(
				`Flag "${key}" must have defaultEnabled: false for safe rollout`,
			);
		}
	}
}

export function getClientFlagKey(
	flag: string,
	entry: FlagRegistryEntry,
): string {
	if (entry.clientKey) return entry.clientKey;
	return flag.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}
