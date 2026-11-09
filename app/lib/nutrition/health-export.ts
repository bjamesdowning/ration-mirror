import { healthExportAllowed } from "./health-exportability";

/** Quantity types Ration can fill with a real number. Nothing else is written. */
export const HEALTH_QUANTITY_TYPES = [
	"dietaryEnergyConsumed",
	"dietaryProtein",
	"dietaryCarbohydrates",
	"dietaryFatTotal",
	"dietaryFiber",
] as const;

export type HealthQuantityType = (typeof HEALTH_QUANTITY_TYPES)[number];

const ALLOWED = new Set<string>(HEALTH_QUANTITY_TYPES);

export type HealthExportStatus =
	| "off"
	| "needs_device_permission"
	| "denied"
	| "on";

export type HealthExportPreference = {
	enabled: boolean;
	deviceStatus: HealthExportStatus;
	clearRequested: boolean;
};

export type HealthIntakeRow = {
	id: string;
	userId: string;
	organizationId: string | null;
	name: string | null;
	voidedAt?: Date | string | number | null;
	healthSyncId: string | null;
	healthSyncVersion: number | null;
	compositionSource: string | null;
	compositionConfirmedAt?: Date | string | number | null;
	energyKcal: number | null;
	proteinG: number | null;
	carbsG: number | null;
	fatG: number | null;
	fiberG: number | null;
	occurredAt: Date | string | number;
	/** Present so a caller can prove it is ignored. */
	verified?: number | null;
};

export type HealthCursor = {
	written: Record<string, number>;
	deleted: string[];
};

export type PlannedHealthSample = {
	action: "write" | "replace";
	syncIdentifier: string;
	syncVersion: number;
	quantityType: HealthQuantityType;
	value: number;
	unit: "kcal" | "g";
	intakeId: string;
	healthSyncId: string;
	occurredAt: string;
	foodName: string;
};

export type PlannedHealthDelete = {
	action: "delete";
	healthSyncId: string;
	syncIdentifiers: string[];
};

export type HealthExportPlan = {
	samples: PlannedHealthSample[];
	deletes: PlannedHealthDelete[];
	/** Always empty. A daily sum would double-count foods already written. */
	dailyTotals: readonly [];
};

const NUTRIENTS: ReadonlyArray<{
	type: HealthQuantityType;
	unit: "kcal" | "g";
	read: (row: HealthIntakeRow) => number | null;
}> = [
	{
		type: "dietaryEnergyConsumed",
		unit: "kcal",
		read: (row) => finite(row.energyKcal),
	},
	{ type: "dietaryProtein", unit: "g", read: (row) => finite(row.proteinG) },
	{
		type: "dietaryCarbohydrates",
		unit: "g",
		read: (row) => finite(row.carbsG),
	},
	{ type: "dietaryFatTotal", unit: "g", read: (row) => finite(row.fatG) },
	{
		type: "dietaryFiber",
		unit: "g",
		read: (row) => (row.fiberG == null ? null : finite(row.fiberG)),
	},
];

export function emptyHealthCursor(): HealthCursor {
	return { written: {}, deleted: [] };
}

export function healthSyncIdentifier(
	healthSyncId: string,
	nutrient: HealthQuantityType,
): string {
	return `ration:${healthSyncId}:${nutrient}`;
}

export function healthExportStatusOf(
	preference: HealthExportPreference | null | undefined,
): HealthExportStatus {
	if (!preference?.enabled) return "off";
	if (preference.deviceStatus === "denied") return "denied";
	if (preference.deviceStatus === "on") return "on";
	return "needs_device_permission";
}

/**
 * The device may open HealthKit only after intake consent, the person's
 * opt-in, and a request limited to dietary types. Missing consent stays closed.
 */
export function mayOpenHealthStore(input: {
	intakeConsent: boolean;
	enabled: boolean;
}): boolean {
	return input.intakeConsent && input.enabled;
}

export function planHealthExport(input: {
	rows: readonly HealthIntakeRow[];
	viewerUserId: string;
	activeOrganizationId: string;
	crossKitchen: boolean;
	cursor: HealthCursor;
}): HealthExportPlan {
	const samples: PlannedHealthSample[] = [];
	const deletes: PlannedHealthDelete[] = [];
	const deleted = new Set(input.cursor.deleted);

	for (const row of input.rows) {
		if (row.userId !== input.viewerUserId) continue;
		if (
			!input.crossKitchen &&
			row.organizationId !== input.activeOrganizationId
		) {
			continue;
		}
		const healthSyncId = row.healthSyncId?.trim() ?? "";
		const version = row.healthSyncVersion;
		if (!healthSyncId || version == null || !Number.isInteger(version)) {
			continue;
		}
		if (row.voidedAt != null) {
			if (deleted.has(healthSyncId)) continue;
			deletes.push({
				action: "delete",
				healthSyncId,
				syncIdentifiers: HEALTH_QUANTITY_TYPES.map((nutrient) =>
					healthSyncIdentifier(healthSyncId, nutrient),
				),
			});
			continue;
		}
		if (
			!healthExportAllowed({
				compositionSource: row.compositionSource,
				compositionConfirmedAt: row.compositionConfirmedAt,
			})
		) {
			continue;
		}
		const seen = input.cursor.written[healthSyncId];
		if (seen != null && seen >= version) continue;
		const action: PlannedHealthSample["action"] =
			seen == null ? "write" : "replace";
		const occurredAt = toIso(row.occurredAt);
		const foodName = row.name?.trim() || "Food";
		for (const nutrient of NUTRIENTS) {
			const value = nutrient.read(row);
			if (value == null) continue;
			samples.push({
				action,
				syncIdentifier: healthSyncIdentifier(healthSyncId, nutrient.type),
				syncVersion: version,
				quantityType: nutrient.type,
				value,
				unit: nutrient.unit,
				intakeId: row.id,
				healthSyncId,
				occurredAt,
				foodName,
			});
		}
	}

	return { samples, deletes, dailyTotals: [] };
}

export function advanceHealthCursor(
	cursor: HealthCursor,
	plan: HealthExportPlan,
): HealthCursor {
	const written = { ...cursor.written };
	const deleted = new Set(cursor.deleted);
	for (const sample of plan.samples) {
		const prior = written[sample.healthSyncId] ?? 0;
		if (sample.syncVersion > prior)
			written[sample.healthSyncId] = sample.syncVersion;
	}
	for (const item of plan.deletes) {
		deleted.add(item.healthSyncId);
		delete written[item.healthSyncId];
	}
	return { written, deleted: [...deleted] };
}

const REFUSED_TYPES = new Set([
	"dailyTotal",
	"bodyMass",
	"stepCount",
	"activeEnergyBurned",
	"workout",
]);

/** Drop a daily total, another app's sample, or any type Ration does not collect. */
export function samplesSafeToWrite(
	samples: readonly PlannedHealthSample[],
): PlannedHealthSample[] {
	return samples.filter(
		(sample) =>
			ALLOWED.has(sample.quantityType) &&
			!REFUSED_TYPES.has(sample.quantityType) &&
			sample.syncIdentifier.startsWith(`ration:${sample.healthSyncId}:`),
	);
}

function finite(value: number | null | undefined): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toIso(value: Date | string | number): string {
	if (value instanceof Date) return value.toISOString();
	if (typeof value === "number") {
		const millis = value < 1e12 ? value * 1000 : value;
		return new Date(millis).toISOString();
	}
	return new Date(value).toISOString();
}
