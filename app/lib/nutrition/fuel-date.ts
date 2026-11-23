import {
	formatISODateInTimeZone,
	isValidIanaTimeZone,
} from "~/lib/kitchen-time";
import {
	FuelDateImmutableError,
	FuelTimezoneRequiredError,
} from "./fuel-errors";

/** Person calendar day. Offsets and abbreviations are rejected. */
export function fuelDateForInstant(occurredAt: Date, timeZone: string): string {
	if (!isValidIanaTimeZone(timeZone)) throw new FuelTimezoneRequiredError();
	if (Number.isNaN(occurredAt.getTime())) throw new FuelTimezoneRequiredError();
	return formatISODateInTimeZone(occurredAt, timeZone);
}

/**
 * An edit may move the clock inside the stored day.
 * A different calendar day is refused. The stored stamp is never rewritten.
 */
export function assertFuelDateUnchanged(
	storedFuelDate: string | null,
	occurredAt: Date,
	timeZone: string,
): string | null {
	if (!storedFuelDate) return null;
	const next = fuelDateForInstant(occurredAt, timeZone);
	if (next !== storedFuelDate) throw new FuelDateImmutableError();
	return storedFuelDate;
}

/** A real Gregorian day. `2026-02-31` matches the shape and is still rejected. */
export function isCalendarDate(value: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return false;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const utc = new Date(Date.UTC(year, month - 1, day));
	return (
		utc.getUTCFullYear() === year &&
		utc.getUTCMonth() === month - 1 &&
		utc.getUTCDate() === day
	);
}

function hourInTimeZone(instant: Date, timeZone: string): number {
	const hour = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour: "2-digit",
		hourCycle: "h23",
	})
		.formatToParts(instant)
		.find((part) => part.type === "hour")?.value;
	const parsed = Number(hour);
	if (!Number.isInteger(parsed)) throw new FuelTimezoneRequiredError();
	return parsed === 24 ? 0 : parsed;
}

/** Local noon on that calendar day, so the stored clock stays on the chosen day. */
export function noonOnFuelDate(fuelDate: string, timeZone: string): Date {
	if (!isCalendarDate(fuelDate) || !isValidIanaTimeZone(timeZone)) {
		throw new FuelTimezoneRequiredError();
	}
	let cursor = new Date(`${fuelDate}T12:00:00.000Z`);
	for (
		let step = 0;
		step < 30 && fuelDateForInstant(cursor, timeZone) !== fuelDate;
		step += 1
	) {
		const local = fuelDateForInstant(cursor, timeZone);
		cursor = new Date(
			cursor.getTime() + (local > fuelDate ? -1 : 1) * 60 * 60 * 1000,
		);
	}
	if (fuelDateForInstant(cursor, timeZone) !== fuelDate) {
		throw new FuelTimezoneRequiredError();
	}
	const noon = new Date(
		cursor.getTime() +
			(12 - hourInTimeZone(cursor, timeZone)) * 60 * 60 * 1000,
	);
	if (fuelDateForInstant(noon, timeZone) === fuelDate) return noon;
	return cursor;
}
