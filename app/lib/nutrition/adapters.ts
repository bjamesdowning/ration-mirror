import {
	emptyNutrientRecord,
	nutrientCoverageRatio,
	projectNullableToLegacy,
	projectNullableValuesToLegacy,
	toNullableNutrientValues,
} from "./scale-nutrients";
import type {
	AnyNutritionSnapshot,
	NullableNutrientValues,
	NutrientValues,
	NutritionMatchQuality,
	NutritionSnapshot,
	NutritionSnapshotV2,
	NutritionSource,
} from "./types";

export function isNutritionSnapshotV2(
	snapshot: unknown,
): snapshot is NutritionSnapshotV2 {
	return (
		typeof snapshot === "object" &&
		snapshot !== null &&
		(snapshot as NutritionSnapshotV2).schemaVersion === 2
	);
}

export function detectNutritionSchemaVersion(snapshot: unknown): 1 | 2 {
	return isNutritionSnapshotV2(snapshot) ? 2 : 1;
}

export function matchQualityFromLegacy(
	source: NutritionSource,
	confidence: number,
	verified: boolean,
): NutritionMatchQuality {
	if (verified && source === "usda") return "verified";
	if (verified) return "high";
	if (confidence >= 0.85) return "high";
	if (confidence >= 0.6) return "medium";
	if (confidence > 0) return "low";
	return "unknown";
}

export function sourceRefFromSnapshot(
	snapshot: Pick<NutritionSnapshot, "fdcId" | "source"> & {
		sourceRef?: string | null;
	},
): string | null {
	if (snapshot.sourceRef) return snapshot.sourceRef;
	if (snapshot.fdcId != null) return `fdc:${snapshot.fdcId}`;
	return null;
}

export function inferServingBasis(
	snapshot: Pick<NutritionSnapshot, "per100g" | "perServing">,
): NutritionSnapshotV2["servingBasis"] {
	if (snapshot.perServing) return "perServing";
	if (snapshot.per100g) return "per100g";
	return null;
}

/** Upgrade legacy v1 snapshot to v2 contract (nullable nutrient blocks). */
export function upgradeNutritionSnapshotToV2(
	snapshot: NutritionSnapshot,
): NutritionSnapshotV2 {
	const per100g = snapshot.per100g
		? toNullableNutrientValues(snapshot.per100g)
		: null;
	const perServing = snapshot.perServing
		? toNullableNutrientValues(snapshot.perServing)
		: null;
	const coverage = Math.max(
		nutrientCoverageRatio(per100g),
		nutrientCoverageRatio(perServing),
	);

	return {
		schemaVersion: 2,
		source: snapshot.source,
		confidence: snapshot.confidence,
		verified: snapshot.verified,
		per100g,
		perServing,
		fdcId: snapshot.fdcId,
		description: snapshot.description,
		sourceRef: sourceRefFromSnapshot(snapshot),
		matchQuality: matchQualityFromLegacy(
			snapshot.source,
			snapshot.confidence,
			snapshot.verified,
		),
		servingBasis: inferServingBasis(snapshot),
		nutrientCoverage: coverage,
	};
}

/** Normalize any persisted snapshot to v2. */
export function normalizeNutritionSnapshot(
	snapshot: AnyNutritionSnapshot,
): NutritionSnapshotV2 {
	if (isNutritionSnapshotV2(snapshot)) return snapshot;
	return upgradeNutritionSnapshotToV2(snapshot);
}

/** Project v2 (or v1) snapshot to legacy v1 shape for existing UI/persist paths. */
export function projectNutritionSnapshotToLegacy(
	snapshot: AnyNutritionSnapshot,
): NutritionSnapshot {
	if (!isNutritionSnapshotV2(snapshot)) return snapshot;

	return {
		source: snapshot.source,
		confidence: snapshot.confidence,
		verified: snapshot.verified,
		per100g: snapshot.per100g
			? projectNullableValuesToLegacy(snapshot.per100g)
			: null,
		perServing: snapshot.perServing
			? projectNullableValuesToLegacy(snapshot.perServing)
			: null,
		fdcId: snapshot.fdcId,
		description: snapshot.description,
	};
}

/** Project nullable nutrient record to legacy numeric shape (null → 0 on core macros). */
export function projectNutrientsToLegacy(
	values: NullableNutrientValues | null,
): NutrientValues {
	if (!values) return projectNullableToLegacy(emptyNutrientRecord());
	return projectNullableValuesToLegacy(values);
}

/** Fraction of {@link NUTRIENT_KEYS} with non-null values. */
export function nutrientFieldCoverage(
	values: NullableNutrientValues | null,
): number {
	return nutrientCoverageRatio(values);
}
