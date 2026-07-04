import { and, eq, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { manifestSupplyDay } from "../db/schema";
import { getTodayISO, getWeekEnd, getWeekStart } from "./manifest-dates";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function parseManifestSupplyDate(date: string): void {
	if (!ISO_DATE_REGEX.test(date)) {
		throw new Error("Invalid date — must be YYYY-MM-DD");
	}
}

/** Dates excluded from Supply sync for the org (explicit rows only). */
export async function getExcludedManifestDates(
	db: D1Database,
	organizationId: string,
	startDate?: string,
	endDate?: string,
): Promise<string[]> {
	const d1 = drizzle(db);
	const conditions = [
		eq(manifestSupplyDay.organizationId, organizationId),
		eq(manifestSupplyDay.excluded, true),
	];
	if (startDate) {
		conditions.push(gte(manifestSupplyDay.date, startDate));
	}
	if (endDate) {
		conditions.push(lte(manifestSupplyDay.date, endDate));
	}

	const rows = await d1
		.select({ date: manifestSupplyDay.date })
		.from(manifestSupplyDay)
		.where(and(...conditions));

	return rows.map((r) => r.date);
}

export async function isManifestDateIncludedInSupply(
	db: D1Database,
	organizationId: string,
	date: string,
): Promise<boolean> {
	parseManifestSupplyDate(date);
	const d1 = drizzle(db);
	const [row] = await d1
		.select({ excluded: manifestSupplyDay.excluded })
		.from(manifestSupplyDay)
		.where(
			and(
				eq(manifestSupplyDay.organizationId, organizationId),
				eq(manifestSupplyDay.date, date),
			),
		)
		.limit(1);

	if (!row) return true;
	return !row.excluded;
}

/** Toggle whether a manifest day contributes to Supply sync. Default is included. */
export async function toggleManifestDaySupply(
	db: D1Database,
	organizationId: string,
	date: string,
): Promise<{ date: string; includedInSupply: boolean }> {
	parseManifestSupplyDate(date);
	const d1 = drizzle(db);
	const now = new Date();

	const [existing] = await d1
		.select({ excluded: manifestSupplyDay.excluded })
		.from(manifestSupplyDay)
		.where(
			and(
				eq(manifestSupplyDay.organizationId, organizationId),
				eq(manifestSupplyDay.date, date),
			),
		)
		.limit(1);

	const nextIncluded = existing?.excluded === true;

	await d1
		.insert(manifestSupplyDay)
		.values({
			organizationId,
			date,
			excluded: !nextIncluded,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [manifestSupplyDay.organizationId, manifestSupplyDay.date],
			set: {
				excluded: !nextIncluded,
				updatedAt: now,
			},
		});

	return { date, includedInSupply: nextIncluded };
}

/** Excluded dates in the current manifest week for UI chips. */
export async function getManifestSupplyDayMapForWeek(
	db: D1Database,
	organizationId: string,
	weekStart: "sunday" | "monday" = "sunday",
): Promise<Record<string, boolean>> {
	const today = getTodayISO();
	const startDate = getWeekStart(today, weekStart);
	const endDate = getWeekEnd(startDate);
	const excluded = await getExcludedManifestDates(
		db,
		organizationId,
		startDate,
		endDate,
	);
	const map: Record<string, boolean> = {};
	for (const date of excluded) {
		map[date] = false;
	}
	return map;
}
