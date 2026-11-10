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
