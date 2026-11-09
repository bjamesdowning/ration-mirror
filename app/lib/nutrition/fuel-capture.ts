import { isVersionAtLeast } from "~/lib/client-version";

/**
 * Personal log and its capture UI share one flag.
 * iOS below 1.6.0 fails closed. Do not raise IOS_FEATURE_FLOOR
 * and do not mark the flag iosAlwaysOn.
 */
export const NUTRITION_FAST_LOG_IOS_MIN = "1.6.0";

export const FUEL_CAPTURE_ADD_TO_CARGO = "Add to Cargo";
export const FUEL_CAPTURE_LOG_TO_FUEL = "Log to Fuel";

/** The only actions on the capture sheet. Copilot is not one of them. */
export const FUEL_CAPTURE_CHOICES = [
	FUEL_CAPTURE_ADD_TO_CARGO,
	FUEL_CAPTURE_LOG_TO_FUEL,
] as const;

const BANNED_CAPTURE_LABELS = [
	"Copilot",
	"Scan items",
	"Log food",
	"I ate this",
] as const;

type ClientVersionContext = {
	clientPlatform?: string | number | boolean;
	clientVersion?: string | number | boolean;
};

export function nutritionFastLogClientAllowed(
	context: ClientVersionContext,
): boolean {
	if (context.clientPlatform !== "ios") return true;
	const version = context.clientVersion;
	if (typeof version !== "string") return false;
	return isVersionAtLeast(version, NUTRITION_FAST_LOG_IOS_MIN);
}

/** One existing control. The sheet is absent when the flag or the iOS version says no. */
export function fuelCaptureChoiceVisible(input: {
	fastLogEnabled: boolean;
	clientPlatform?: string | number | boolean;
	clientVersion?: string | number | boolean;
}): boolean {
	if (!input.fastLogEnabled) return false;
	return nutritionFastLogClientAllowed(input);
}

/** Shutter and barcode stay off unless their child flag and the parent capture control are on. */
export function fuelLogControlEnabled(input: {
	fastLogEnabled: boolean;
	childEnabled: boolean;
	clientPlatform?: string | number | boolean;
	clientVersion?: string | number | boolean;
}): boolean {
	return (
		input.childEnabled &&
		fuelCaptureChoiceVisible({
			fastLogEnabled: input.fastLogEnabled,
			clientPlatform: input.clientPlatform,
			clientVersion: input.clientVersion,
		})
	);
}

export function fuelCaptureChoiceLabels(
	choiceVisible: boolean,
): readonly string[] {
	return choiceVisible ? FUEL_CAPTURE_CHOICES : [];
}

export function dailyFuelOpensGoals(choiceVisible: boolean): boolean {
	return !choiceVisible;
}

export function captureLabelsAreExclusive(labels: readonly string[]): boolean {
	return (
		labels.length === FUEL_CAPTURE_CHOICES.length &&
		labels.every((label, index) => label === FUEL_CAPTURE_CHOICES[index]) &&
		BANNED_CAPTURE_LABELS.every((banned) => !labels.includes(banned))
	);
}

/** A failed send retries the same draft. A new draft mints a key. */
export function diaryOperationKey(
	existing: string | null | undefined,
	mint: () => string,
): string {
	if (existing && existing.length > 0) return existing;
	return mint();
}

export type ManifestDayIntakeFields = {
	id: string;
	entryId?: string | null;
	manifestDate: string;
	slotType: string | null;
	servings: number;
	energyKcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	mealName: string | null;
	organizationName?: string | null;
	notes?: string | null;
	occurredAt?: string | Date | null;
	loggedAmount?: number | null;
	loggedUnit?: "serving" | "g" | "oz" | null;
};

/** Additive day-list row. Edit and void apply only to a personal log (`entryId` null). */
export function toManifestDayIntake(row: ManifestDayIntakeFields) {
	return {
		id: row.id,
		manifestDate: row.manifestDate,
		slotType: row.slotType,
		servings: row.servings,
		energyKcal: row.energyKcal,
		proteinG: row.proteinG,
		carbsG: row.carbsG,
		fatG: row.fatG,
		mealName: row.mealName,
		organizationName: row.organizationName ?? null,
		notes: row.notes ?? null,
		occurredAt:
			row.occurredAt instanceof Date
				? row.occurredAt.toISOString()
				: (row.occurredAt ?? null),
		entryId: row.entryId ?? null,
		personalLog: row.entryId === null,
		loggedAmount: row.loggedAmount ?? null,
		loggedUnit: row.loggedUnit ?? null,
	};
}
