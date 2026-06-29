import type { z } from "zod";
import { BulkEntryCreateSchema } from "~/lib/schemas/manifest";
import { ImportConfirmRequestSchema } from "~/lib/schemas/recipe-import";
import { WeekPlanRequestSchema } from "~/lib/schemas/week-plan";

export const MobileWeekPlanRequestSchema = WeekPlanRequestSchema;

export const MobileBulkEntryCreateSchema = BulkEntryCreateSchema;

export const MobileImportConfirmRequestSchema = ImportConfirmRequestSchema;

export type MobileWeekPlanRequest = z.infer<typeof MobileWeekPlanRequestSchema>;
export type MobileBulkEntryCreate = z.infer<typeof MobileBulkEntryCreateSchema>;
