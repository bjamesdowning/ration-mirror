import { z } from "zod";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isRealISODate(value: string): boolean {
	const match = ISO_DATE.exec(value);
	if (!match) return false;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

/** Device-local calendar day for the Home Screen widget snapshot. */
export const HomeWidgetQuerySchema = z.object({
	date: z.string().refine(isRealISODate, "Expected YYYY-MM-DD"),
});
