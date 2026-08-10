import type { NutritionLookupStatus } from "~/lib/nutrition/scan-review-resolve";

/** Pulsing status while scan/dock review resolves nutrients in the background. */
export function NutritionLookupBanner({
	status,
}: {
	status: NutritionLookupStatus;
}) {
	if (status === "idle" || status === "done") return null;

	if (status === "failed") {
		return (
			<p className="text-xs text-muted" role="status">
				Nutrition unavailable — will retry when you add items.
			</p>
		);
	}

	return (
		<p
			className="text-xs text-hyper-green animate-pulse"
			role="status"
			aria-live="polite"
		>
			Looking up nutrients…
		</p>
	);
}

/** Inline kcal slot: value, skeleton while looking up, or nothing after miss. */
export function NutritionKcalHint({
	kcal,
	lookupStatus,
	nutritionField,
	provenanceLabel,
}: {
	kcal: number | null | undefined;
	lookupStatus: NutritionLookupStatus;
	/** `undefined` = not yet looked up; `null` = looked up, no match. */
	nutritionField: unknown | null | undefined;
	/** Optional USDA / AI Estimate / Override label when kcal is shown. */
	provenanceLabel?: string | null;
}) {
	if (kcal != null && Number.isFinite(kcal)) {
		const suffix =
			provenanceLabel && provenanceLabel.trim().length > 0
				? ` · ${provenanceLabel.trim()}`
				: "";
		return (
			<>
				{" "}
				• {Math.round(kcal)} kcal{suffix}
			</>
		);
	}
	const pending =
		lookupStatus === "loading" &&
		nutritionField === undefined &&
		(kcal == null || !Number.isFinite(kcal));
	if (!pending) return null;
	return (
		<>
			{" "}
			•{" "}
			<span
				className="inline-block h-3 w-12 align-middle rounded bg-platinum/50 dark:bg-white/15 animate-pulse"
				role="status"
				aria-label="Looking up calories"
			/>
		</>
	);
}
