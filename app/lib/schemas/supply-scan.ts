import { z } from "zod";
import { ITEM_DOMAINS } from "../domain";
import { RequestIdSchema } from "./queue";
import { UnitSchema } from "./units";

export const SupplyScanMatchQuerySchema = z.object({
	requestId: RequestIdSchema,
});

export const SupplyScanCompletePairSchema = z.object({
	scanItemId: z.string().uuid(),
	/** Present as uuid, null, or omitted (iOS historically omitted for receipt-only). */
	supplyItemId: z.string().uuid().nullish(),
	matchType: z.enum(["exact", "fuzzy", "manual"]).default("manual"),
	dock: z.object({
		name: z.string().min(1).max(200),
		quantity: z.number().min(0),
		unit: UnitSchema,
		domain: z.enum(ITEM_DOMAINS).default("food"),
		tags: z.array(z.string()).default([]),
		expiresAt: z
			.string()
			.nullish()
			.refine(
				(v) =>
					v == null ||
					v === "" ||
					/^\d{4}-\d{2}-\d{2}$/.test(v) ||
					/^\d{4}-\d{2}-\d{2}T/.test(v),
				{ message: "Expiry must be a calendar date" },
			),
		mergeTargetId: z.string().uuid().optional(),
	}),
	updateSupply: z
		.object({
			quantity: z.number().min(0),
			unit: UnitSchema,
		})
		.optional(),
});

export const SupplyScanCompleteRequestSchema = z.object({
	requestId: RequestIdSchema,
	pairs: z.array(SupplyScanCompletePairSchema).min(1).max(100),
	supplyOnlyIds: z.array(z.string().uuid()).optional(),
});

export type SupplyScanCompleteRequest = z.infer<
	typeof SupplyScanCompleteRequestSchema
>;

/** Customer-facing copy when complete body fails Zod validation. */
export const SUPPLY_SCAN_COMPLETE_INVALID_MESSAGE =
	"We couldn't dock these items. Check each line and try again.";
