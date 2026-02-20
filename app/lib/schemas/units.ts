import { z } from "zod";
import { SUPPORTED_UNITS, type SupportedUnit } from "../units";

/** Zod enum for strict unit validation at API boundaries */
export const UnitSchema = z.enum(
	SUPPORTED_UNITS as [SupportedUnit, ...SupportedUnit[]],
);

export type UnitSchemaType = z.infer<typeof UnitSchema>;
