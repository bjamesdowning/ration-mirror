import { z } from "zod";

export const SUPPLY_MANIFEST_HORIZON_MIN = 1;
export const SUPPLY_MANIFEST_HORIZON_MAX = 30;
export const SUPPLY_MANIFEST_HORIZON_DEFAULT = 7;

export const OrganizationSupplySettingsPatchSchema = z.object({
	manifestHorizonDays: z.coerce
		.number()
		.int()
		.min(SUPPLY_MANIFEST_HORIZON_MIN)
		.max(SUPPLY_MANIFEST_HORIZON_MAX),
});

export type OrganizationSupplySettingsPatch = z.infer<
	typeof OrganizationSupplySettingsPatchSchema
>;
