import { z } from "zod";
import { INTAKE_LOGGED_UNITS } from "~/lib/nutrition/intake-amount";
import { IntakeNotesSchema, SLOT_TYPES } from "./manifest";
import { UuidSchema } from "./uuid";

const IsoDateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

export const DiaryMacrosSchema = z.object({
	energyKcal: z.number().finite().nonnegative(),
	proteinG: z.number().finite().nonnegative(),
	carbsG: z.number().finite().nonnegative(),
	fatG: z.number().finite().nonnegative(),
	fiberG: z.number().finite().nonnegative().nullable().optional(),
});

export const DiaryFoodWriteSchema = z
	.object({
		name: z.string().trim().min(1).max(120),
		manifestDate: IsoDateSchema.optional(),
		occurredAt: z.string().datetime({ offset: true }).optional(),
		slotType: z.enum(SLOT_TYPES).nullable().optional(),
		amount: z.number().finite().positive().optional(),
		unit: z.enum(INTAKE_LOGGED_UNITS).optional(),
		macros: DiaryMacrosSchema,
		idempotencyKey: UuidSchema,
		operationKey: UuidSchema,
		notes: IntakeNotesSchema.optional(),
	})
	.superRefine((value, ctx) => {
		const hasAmount = value.amount != null;
		const hasUnit = value.unit != null;
		if (hasAmount !== hasUnit) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "amount and unit must be provided together",
				path: ["unit"],
			});
		}
	});

export type DiaryFoodWrite = z.infer<typeof DiaryFoodWriteSchema>;

export const DiaryVoidSchema = z.object({
	confirm: z.boolean(),
	operationKey: UuidSchema,
});

export const DiaryKitchenSaveSchema = z.object({
	confirm: z.boolean(),
	target: z.enum(["cargo", "meal"]),
	operationKey: UuidSchema,
});

export const DiaryQuoteSchema = z.object({}).strict();
