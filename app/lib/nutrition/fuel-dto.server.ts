/**
 * Fuel day item projection. Malformed rows are skipped and counted.
 * Diagnostics carry a code and a count only.
 */

export type FuelItemSource = {
	id: string;
	name?: string | null;
	mealName?: string | null;
	energyKcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	occurredAt: Date;
	slotType: string | null;
	notes?: string | null;
	servings?: number | null;
	loggedAmount?: number | null;
	loggedUnit?: string | null;
	entryId?: string | null;
};

export type PublishableFuelItem = {
	id: string;
	name: string;
	energyKcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	occurredAt: string;
	slotType: string | null;
	servings: number | null;
	loggedAmount: number | null;
	loggedUnit: string | null;
	entryId?: string;
	/** Present only when the caller asks. Flag-off JSON has no note text. */
	notes?: string | null;
};

export type FuelDiagnostic = {
	code: "malformed_fuel_row";
	skipped: number;
};

const finiteNutrient = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value);

function finiteOrNull(value: unknown): number | null {
	return finiteNutrient(value) ? value : null;
}

function textOrNull(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function selectPublishableFuelItems(
	items: FuelItemSource[],
	record: (diagnostic: FuelDiagnostic) => void = () => {},
	options: { includeNotes?: boolean } = {},
): PublishableFuelItem[] {
	const published: PublishableFuelItem[] = [];
	let skipped = 0;
	for (const item of items) {
		const occurredAt = item.occurredAt;
		const timestampOk =
			occurredAt instanceof Date && !Number.isNaN(occurredAt.getTime());
		if (
			!timestampOk ||
			!finiteNutrient(item.energyKcal) ||
			!finiteNutrient(item.proteinG) ||
			!finiteNutrient(item.carbsG) ||
			!finiteNutrient(item.fatG)
		) {
			skipped += 1;
			continue;
		}
		const row: PublishableFuelItem = {
			id: item.id,
			name: item.mealName?.trim() || item.name?.trim() || "Food",
			energyKcal: item.energyKcal,
			proteinG: item.proteinG,
			carbsG: item.carbsG,
			fatG: item.fatG,
			occurredAt: occurredAt.toISOString(),
			slotType: item.slotType,
			servings: finiteOrNull(item.servings),
			loggedAmount: finiteOrNull(item.loggedAmount),
			loggedUnit: textOrNull(item.loggedUnit),
		};
		if (typeof item.entryId === "string" && item.entryId.length > 0) {
			row.entryId = item.entryId;
		}
		if (options.includeNotes) {
			row.notes = textOrNull(item.notes);
		}
		published.push(row);
	}
	if (skipped > 0) {
		record({ code: "malformed_fuel_row", skipped });
	}
	return published;
}
