import { z } from "zod";
import { CargoItemSchema, PartialCargoItemSchema } from "~/lib/cargo.server";

export const MobileCargoListQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(50),
	cursor: z.string().optional(),
	domain: z.enum(["food", "household", "alcohol"]).optional(),
});

/** Same choice as the web cargo form: merge into the candidate, or create a new row. */
export const MobileCargoMergeIntentSchema = z
	.object({
		mergeChoice: z.enum(["merge", "new"]).optional(),
		mergeTargetId: z.string().min(1).optional(),
	})
	.superRefine((value, ctx) => {
		if (value.mergeChoice === "merge" && !value.mergeTargetId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["mergeTargetId"],
				message: "mergeTargetId is required when mergeChoice is merge",
			});
		}
	});

export const MobileCreateCargoSchema = CargoItemSchema;

export const MobileUpdateCargoSchema = PartialCargoItemSchema;
