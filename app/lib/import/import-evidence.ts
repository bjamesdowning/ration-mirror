/**
 * Import evidence provenance for verify UI and meal customFields.
 */

export const IMPORT_PROGRESS = [
	"reading_page",
	"listening_to_video",
	"extracting",
] as const;

export type ImportProgress = (typeof IMPORT_PROGRESS)[number];

export function isImportProgress(value: unknown): value is ImportProgress {
	return (
		typeof value === "string" &&
		(IMPORT_PROGRESS as readonly string[]).includes(value)
	);
}

export type ImportEvidenceKey =
	| "oembed"
	| "description"
	| "supadata_metadata"
	| "transcript_native"
	| "transcript_asr"
	| "user_text"
	| "json_ld"
	| "page";

const EVIDENCE_LABELS: Record<ImportEvidenceKey, string> = {
	oembed: "From caption",
	description: "From post description",
	supadata_metadata: "From post description",
	transcript_native: "From captions",
	transcript_asr: "From spoken audio",
	user_text: "From caption",
	json_ld: "From recipe card",
	page: "From page",
};

export function importEvidenceLabel(key: string): string {
	if (key in EVIDENCE_LABELS) {
		return EVIDENCE_LABELS[key as ImportEvidenceKey];
	}
	return "From source";
}

/** Deduped, user-facing evidence labels in display order. */
export function importEvidenceSummary(keys: string[] | undefined): string[] {
	if (!keys || keys.length === 0) return [];
	const seen = new Set<string>();
	const labels: string[] = [];
	for (const key of keys) {
		const label = importEvidenceLabel(key);
		if (seen.has(label)) continue;
		seen.add(label);
		labels.push(label);
	}
	return labels;
}

export function serializeImportEvidence(keys: string[]): string {
	return keys.filter((k) => k.trim().length > 0).join(",");
}

export function parseImportEvidence(raw: string | undefined): string[] {
	if (!raw?.trim()) return [];
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

export function countMissingIngredientAmounts(
	ingredients: Array<{ quantity?: number; unit?: string }>,
): number {
	return ingredients.filter((ing) => {
		const qty = ing.quantity ?? 0;
		const unit = (ing.unit ?? "").trim().toLowerCase();
		return qty === 0 || unit.length === 0 || unit === "unit";
	}).length;
}
