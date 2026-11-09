import { z } from "zod";
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
		savedFoodId: UuidSchema.optional(),
		name: z.string().trim().min(1).max(120).optional(),
		manifestDate: IsoDateSchema.optional(),
		occurredAt: z.string().datetime({ offset: true }).optional(),
		slotType: z.enum(SLOT_TYPES).nullable().optional(),
		amount: z.number().finite().positive().optional(),
		unit: z.string().trim().min(1).max(40).optional(),
		macros: DiaryMacrosSchema.optional(),
		/** Density used only when macros are omitted. Never a gram-weight source. */
		per100g: DiaryMacrosSchema.optional(),
		fdcId: z.string().regex(/^\d+$/).optional(),
		compositionSource: z
			.enum([
				"usda",
				"user_override",
				"manual_macros",
				"barcode",
				"ai_estimate",
				"meal",
			])
			.optional(),
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
		if (value.savedFoodId) return;
		if (!value.name) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "name is required",
				path: ["name"],
			});
		}
		if (value.macros) return;
		if (value.per100g) {
			if (value.amount == null || value.unit == null) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "amount and unit are required to scale per 100 g",
					path: ["unit"],
				});
			}
			return;
		}
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "macros are required",
			path: ["macros"],
		});
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
