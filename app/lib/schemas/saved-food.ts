import { z } from "zod";
import { INTAKE_LOGGED_UNITS } from "~/lib/nutrition/intake-amount";
import { DiaryMacrosSchema } from "./diary";
import { UuidSchema } from "./uuid";

export const SaveFoodSchema = z.object({
	name: z.string().trim().min(1).max(120),
	amount: z.number().finite().positive(),
	unit: z.enum(INTAKE_LOGGED_UNITS),
	macros: DiaryMacrosSchema,
	barcode: z.string().trim().min(1).max(64).nullable().optional(),
	fdcId: z.string().trim().min(1).max(32).nullable().optional(),
});

export type SaveFoodInput = z.infer<typeof SaveFoodSchema>;

export const DeleteSavedFoodSchema = z.object({
	confirm: z.literal(true),
});

export const SavedFoodIdSchema = UuidSchema;
