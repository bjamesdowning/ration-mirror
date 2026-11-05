import { z } from "zod";
import { isValidIanaTimeZone } from "~/lib/kitchen-time";

export const SUPPLY_MANIFEST_HORIZON_MIN = 1;
export const SUPPLY_MANIFEST_HORIZON_MAX = 30;
export const SUPPLY_MANIFEST_HORIZON_DEFAULT = 7;

export const IanaTimeZoneSchema = z
	.string()
	.trim()
	.min(1)
	.max(64)
	.refine(isValidIanaTimeZone, "Must be an IANA time zone");

export const OrganizationSupplySettingsPatchSchema = z
	.object({
		manifestHorizonDays: z.coerce
			.number()
			.int()
			.min(SUPPLY_MANIFEST_HORIZON_MIN)
			.max(SUPPLY_MANIFEST_HORIZON_MAX)
			.optional(),
		timeZone: IanaTimeZoneSchema.optional(),
	})
	.refine(
		(value) =>
			value.manifestHorizonDays !== undefined || value.timeZone !== undefined,
		{ message: "Provide manifestHorizonDays or timeZone" },
	);

export type OrganizationSupplySettingsPatch = z.infer<
	typeof OrganizationSupplySettingsPatchSchema
>;

/** Drops omitted fields so a horizon patch does not send `timeZone: undefined`. */
export function compactSupplySettingsPatch(
	patch: OrganizationSupplySettingsPatch,
): OrganizationSupplySettingsPatch {
	return {
		...(patch.manifestHorizonDays !== undefined
			? { manifestHorizonDays: patch.manifestHorizonDays }
			: {}),
		...(patch.timeZone !== undefined ? { timeZone: patch.timeZone } : {}),
	};
}
