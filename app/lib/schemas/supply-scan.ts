import { z } from "zod";
import { ITEM_DOMAINS } from "../domain";
import { RequestIdSchema } from "./queue";
import { UnitSchema } from "./units";

export const SupplyScanMatchQuerySchema = z.object({
	requestId: RequestIdSchema,
});

export const SupplyScanCompletePairSchema = z.object({
	scanItemId: z.string().uuid(),
	supplyItemId: z.string().uuid().nullable(),
	matchType: z.enum(["exact", "fuzzy", "manual"]).default("manual"),
	dock: z.object({
		name: z.string().min(1).max(200),
		quantity: z.number().min(0),
		unit: UnitSchema,
		domain: z.enum(ITEM_DOMAINS).default("food"),
		tags: z.array(z.string()).default([]),
		expiresAt: z.string().optional(),
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
