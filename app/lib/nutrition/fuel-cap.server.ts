import { getEffectiveTier } from "~/lib/capacity.server";
import type { TierSlug } from "~/lib/types";
import { fuelDateForInstant } from "./fuel-date";
import {
	FUEL_DAILY_LIMIT,
	FuelDailyLimitError,
	FuelTimezoneRequiredError,
} from "./fuel-errors";

type CrewRow = {
	tier: string | null;
	tier_expires_at: number | string | null;
	zone: string | null;
};

function asTier(value: string | null): TierSlug {
	return value === "crew_member" ? "crew_member" : "free";
}

async function loadPerson(
	db: D1Database,
	userId: string,
): Promise<CrewRow | null> {
	return db
		.prepare(
			`SELECT tier, tier_expires_at, json_extract(settings, '$.fuelTimeZone') AS zone
			 FROM user WHERE id = ?`,
		)
		.bind(userId)
		.first<CrewRow>();
}

export async function personIsCrew(
	db: D1Database,
	userId: string,
	now = new Date(),
): Promise<boolean> {
	const row = await loadPerson(db, userId);
	const { tier } = getEffectiveTier(
		asTier(row?.tier ?? null),
		row?.tier_expires_at ?? null,
		now,
	);
	return tier === "crew_member";
}

export async function requireFuelTimeZone(
	db: D1Database,
	userId: string,
): Promise<string> {
	const row = await loadPerson(db, userId);
	const zone = typeof row?.zone === "string" ? row.zone : "";
	if (!zone) throw new FuelTimezoneRequiredError();
	try {
		fuelDateForInstant(new Date(), zone);
	} catch {
		throw new FuelTimezoneRequiredError();
	}
	return zone;
}

export async function readFuelUsed(
	db: D1Database,
	userId: string,
	fuelDate: string,
): Promise<number> {
	const row = await db
		.prepare(
			"SELECT used FROM nutrition_fuel_day WHERE user_id = ? AND fuel_date = ?",
		)
		.bind(userId, fuelDate)
		.first<{ used: number }>();
	return row?.used ?? 0;
}

async function updateUsed(
	db: D1Database,
	userId: string,
	fuelDate: string,
	crew: boolean,
): Promise<number> {
	const sql = crew
		? `UPDATE nutrition_fuel_day SET used = used + 1
			 WHERE user_id = ? AND fuel_date = ?`
		: `UPDATE nutrition_fuel_day SET used = used + 1
			 WHERE user_id = ? AND fuel_date = ? AND used + 1 <= ?`;
	const statement = crew
		? db.prepare(sql).bind(userId, fuelDate)
		: db.prepare(sql).bind(userId, fuelDate, FUEL_DAILY_LIMIT);
	const result = await statement.run();
	return result.meta.changes ?? 0;
}

function isUniqueConflict(error: unknown): boolean {
	const text = error instanceof Error ? error.message : String(error);
	return text.toLowerCase().includes("unique");
}

/**
 * One slot for one new intake row. Crew increments with no ceiling.
 * A free day already at the limit writes nothing.
 */
export async function reserveFuelSlot(
	db: D1Database,
	userId: string,
	fuelDate: string,
	crew: boolean,
): Promise<void> {
	if ((await updateUsed(db, userId, fuelDate, crew)) > 0) return;
	try {
		await db
			.prepare(
				"INSERT INTO nutrition_fuel_day (user_id, fuel_date, used) VALUES (?, ?, 1)",
			)
			.bind(userId, fuelDate)
			.run();
		return;
	} catch (error) {
		if (!isUniqueConflict(error)) throw error;
	}
	if ((await updateUsed(db, userId, fuelDate, crew)) > 0) return;
	if (crew) {
		throw new Error("Fuel day counter could not be reserved");
	}
	const used = await readFuelUsed(db, userId, fuelDate);
	throw new FuelDailyLimitError(Math.max(used, FUEL_DAILY_LIMIT), fuelDate);
}

export async function releaseFuelSlot(
	db: D1Database,
	userId: string,
	fuelDate: string,
): Promise<void> {
	await db
		.prepare(
			`UPDATE nutrition_fuel_day SET used = used - 1
			 WHERE user_id = ? AND fuel_date = ? AND used >= 1`,
		)
		.bind(userId, fuelDate)
		.run();
}

/** Read-only gate for camera, lookup, and upload. Does not change `used`. */
export async function assertFuelCreateRoom(
	db: D1Database,
	userId: string,
	occurredAt: Date,
	now = new Date(),
): Promise<{ fuelDate: string; used: number; crew: boolean }> {
	const zone = await requireFuelTimeZone(db, userId);
	const fuelDate = fuelDateForInstant(occurredAt, zone);
	const crew = await personIsCrew(db, userId, now);
	const used = await readFuelUsed(db, userId, fuelDate);
	if (!crew && used >= FUEL_DAILY_LIMIT) {
		throw new FuelDailyLimitError(used, fuelDate);
	}
	return { fuelDate, used, crew };
}

export async function stampFuelDate(
	db: D1Database,
	userId: string,
	occurredAt: Date,
): Promise<string> {
	const zone = await requireFuelTimeZone(db, userId);
	return fuelDateForInstant(occurredAt, zone);
}

/** Completed create replay. Does not change `used`. */
export async function completedFuelReplay(
	db: D1Database,
	userId: string,
	operationKey: string,
): Promise<{ intakeId: string | null } | null> {
	const row = await db
		.prepare(
			`SELECT status, result_json AS resultJson
			 FROM nutrition_operation
			 WHERE user_id = ? AND operation_key = ?`,
		)
		.bind(userId, operationKey)
		.first<{ status: string; resultJson: string | null }>();
	if (!row) return null;
	if (row.status !== "completed") return null;
	let intakeId: string | null = null;
	if (row.resultJson) {
		try {
			const parsed = JSON.parse(row.resultJson) as { intakeId?: unknown };
			if (typeof parsed.intakeId === "string") intakeId = parsed.intakeId;
		} catch {
			intakeId = null;
		}
	}
	return { intakeId };
}
