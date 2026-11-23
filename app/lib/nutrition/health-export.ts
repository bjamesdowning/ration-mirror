import {
	healthSampleUsable,
	legacyHealthExportAllowed,
} from "./health-exportability";

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
	/** Present (true) only for an AI estimate. The device marks the sample. */
	estimate?: true;
};

export type PlannedHealthDelete = {
	action: "delete";
	healthSyncId: string;
	syncIdentifiers: string[];
};

/**
 * Lines Ration kept out of Apple Health, by reason. Shown to the person so a
 * missing food is explained rather than silent. All three keys stay on the
 * wire because iOS 1.6.39+ requires them. Under the current rule aiEstimate
 * and unconfirmed are always 0, and notExportable counts logs with missing or
 * implausible numbers plus older logs without a Health id. The legacy rule
 * (iOS 1.6.39/1.6.40) counts meals under notExportable.
 */
export type HealthExportExclusions = {
	aiEstimate: number;
	unconfirmed: number;
	notExportable: number;
};

/**
 * Which exportability rule a pull uses. `current`: every live, usable Fuel
 * log. `legacy`: the rule iOS 1.6.39/1.6.40 shipped with (confirmed
 * non-estimate, non-meal lines only).
 */
export type HealthExportRules = "current" | "legacy";

export type HealthExportPlan = {
	samples: PlannedHealthSample[];
	deletes: PlannedHealthDelete[];
	/** Always empty. A daily sum would double-count foods already written. */
	dailyTotals: readonly [];
	excluded: HealthExportExclusions;
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

export function emptyHealthExclusions(): HealthExportExclusions {
	return { aiEstimate: 0, unconfirmed: 0, notExportable: 0 };
}

function allSyncIdentifiers(healthSyncId: string): string[] {
	return HEALTH_QUANTITY_TYPES.map((nutrient) =>
		healthSyncIdentifier(healthSyncId, nutrient),
	);
}

function fullDelete(healthSyncId: string): PlannedHealthDelete {
	return {
		action: "delete",
		healthSyncId,
		syncIdentifiers: allSyncIdentifiers(healthSyncId),
	};
}

function validSyncId(row: HealthIntakeRow): string | null {
	const healthSyncId = row.healthSyncId?.trim() ?? "";
	const version = row.healthSyncVersion;
	if (!healthSyncId || version == null || !Number.isInteger(version)) {
		return null;
	}
	return healthSyncId;
}

function legacyExclusionReason(
	row: HealthIntakeRow,
): keyof HealthExportExclusions | null {
	if (row.compositionSource === "ai_estimate") return "aiEstimate";
	if (
		legacyHealthExportAllowed({
			compositionSource: row.compositionSource,
			compositionConfirmedAt: row.compositionConfirmedAt,
		})
	) {
		return null;
	}
	if (
		legacyHealthExportAllowed({
			compositionSource: row.compositionSource,
			compositionConfirmedAt: new Date(0),
		})
	) {
		return "unconfirmed";
	}
	return "notExportable";
}

/**
 * Plan the HealthKit writes and deletes for one person.
 *
 * An edit voids the old row and inserts a new live row that keeps the same
 * healthSyncId with a higher healthSyncVersion. The voided predecessor must
 * never delete the live samples, so live ids are collected first. A voided id
 * is fully deleted only when no live row (in this window or in `liveSyncIds`,
 * which the caller looks up outside the window) still carries it. When an
 * edit clears a nutrient, only that nutrient's stale sample is deleted.
 *
 * `rules: "current"` exports every live Fuel log whose numbers pass
 * `healthSampleUsable`, except a row whose `compositionSource` is still
 * `ai_estimate`. That row is counted and not written. Accepting restamps it
 * as `user_override` before export. The food name is not prefixed. A live
 * row that fails the number check is counted and fully deleted, so a 0 kcal
 * or implausible sample written earlier is removed. `rules: "legacy"` (the
 * default) is the iOS 1.6.39/1.6.40 rule; it never deletes a row the current
 * rule would export, so an old phone cannot remove a newer phone's samples.
 */
export function planHealthExport(input: {
	rows: readonly HealthIntakeRow[];
	viewerUserId: string;
	activeOrganizationId: string;
	crossKitchen: boolean;
	cursor?: HealthCursor;
	liveSyncIds?: ReadonlySet<string>;
	rules?: HealthExportRules;
}): HealthExportPlan {
	const current = input.rules === "current";
	const cursor = input.cursor ?? emptyHealthCursor();
	const samples: PlannedHealthSample[] = [];
	const deletes: PlannedHealthDelete[] = [];
	const excluded = emptyHealthExclusions();
	const deleted = new Set(cursor.deleted);
	const live = new Map<string, { row: HealthIntakeRow; version: number }>();
	const voidedIds: string[] = [];
	const voidedSeen = new Set<string>();

	for (const row of input.rows) {
		if (row.userId !== input.viewerUserId) continue;
		if (
			!input.crossKitchen &&
			row.organizationId !== input.activeOrganizationId
		) {
			continue;
		}
		const healthSyncId = validSyncId(row);
		if (row.voidedAt != null) {
			if (healthSyncId && !voidedSeen.has(healthSyncId)) {
				voidedSeen.add(healthSyncId);
				voidedIds.push(healthSyncId);
			}
			continue;
		}
		if (!healthSyncId) {
			excluded.notExportable += 1;
			continue;
		}
		const version = row.healthSyncVersion as number;
		const prior = live.get(healthSyncId);
		if (!prior || version > prior.version) {
			live.set(healthSyncId, { row, version });
		}
	}

	const liveIds = new Set<string>([
		...live.keys(),
		...(input.liveSyncIds ?? []),
	]);
	for (const healthSyncId of voidedIds) {
		if (liveIds.has(healthSyncId)) continue;
		if (deleted.has(healthSyncId)) continue;
		deletes.push(fullDelete(healthSyncId));
	}

	for (const [healthSyncId, { row, version }] of live) {
		const usable = healthSampleUsable(row);
		if (current && !usable) {
			excluded.notExportable += 1;
			// Remove anything Ration wrote for it before this rule existed.
			if (!deleted.has(healthSyncId)) deletes.push(fullDelete(healthSyncId));
			continue;
		}
		if (current && row.compositionSource === "ai_estimate") {
			excluded.aiEstimate += 1;
			continue;
		}
		const reason = current ? null : legacyExclusionReason(row);
		if (reason) {
			excluded[reason] += 1;
			// An edit can turn an exported line into one Health may not hold.
			// A row the current rule exports keeps its samples: a newer phone
			// on the same account may have written them.
			if (
				voidedSeen.has(healthSyncId) &&
				!deleted.has(healthSyncId) &&
				!usable
			) {
				deletes.push(fullDelete(healthSyncId));
			}
			continue;
		}
		const estimate = current && row.compositionSource === "ai_estimate";
		const seen = cursor.written[healthSyncId];
		if (seen != null && seen >= version) continue;
		const action: PlannedHealthSample["action"] =
			seen == null && !voidedSeen.has(healthSyncId) ? "write" : "replace";
		const occurredAt = toIso(row.occurredAt);
		const foodName = row.name?.trim() || "Food";
		const stale: string[] = [];
		for (const nutrient of NUTRIENTS) {
			const value = nutrient.read(row);
			if (value == null) {
				stale.push(healthSyncIdentifier(healthSyncId, nutrient.type));
				continue;
			}
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
				...(estimate ? { estimate: true as const } : {}),
			});
		}
		if (voidedSeen.has(healthSyncId) && stale.length > 0) {
			deletes.push({
				action: "delete",
				healthSyncId,
				syncIdentifiers: stale,
			});
		}
	}

	return { samples, deletes, dailyTotals: [], excluded };
}

/**
 * Delete every Ration sample this person could have written: used when the
 * person removes Ration data from Health, turns export off with removal, or
 * deletes their account. Kitchen scope is ignored on purpose, because a
 * sample written while in another kitchen still sits in the same Health store.
 */
export function planHealthPurge(input: {
	rows: readonly HealthIntakeRow[];
	viewerUserId: string;
	extraSyncIds?: readonly string[];
}): PlannedHealthDelete[] {
	const ids: string[] = [];
	const seen = new Set<string>();
	const add = (healthSyncId: string) => {
		if (seen.has(healthSyncId)) return;
		seen.add(healthSyncId);
		ids.push(healthSyncId);
	};
	for (const row of input.rows) {
		if (row.userId !== input.viewerUserId) continue;
		const healthSyncId = validSyncId(row);
		if (healthSyncId) add(healthSyncId);
	}
	for (const raw of input.extraSyncIds ?? []) {
		const healthSyncId = raw.trim();
		if (healthSyncId) add(healthSyncId);
	}
	return ids.map(fullDelete);
}

export function advanceHealthCursor(
	cursor: HealthCursor,
	plan: Pick<HealthExportPlan, "samples" | "deletes">,
): HealthCursor {
	const written = { ...cursor.written };
	const deleted = new Set(cursor.deleted);
	for (const sample of plan.samples) {
		const prior = written[sample.healthSyncId] ?? 0;
		if (sample.syncVersion > prior)
			written[sample.healthSyncId] = sample.syncVersion;
	}
	for (const item of plan.deletes) {
		// A stale-nutrient delete leaves the live line in Health.
		if (item.syncIdentifiers.length < HEALTH_QUANTITY_TYPES.length) continue;
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
