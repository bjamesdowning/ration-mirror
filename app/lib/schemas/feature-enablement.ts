import { z } from "zod";

const RequestIdSchema = z.string().uuid();

export const FeatureEnablementFeatureSchema = z.enum(["ai", "macro"]);

/** Onboarding Agree: set both toggles in one request. */
export const FeatureEnablementSetSchema = z.object({
	action: z.literal("set"),
	aiFeatures: z.boolean(),
	macroTracking: z.boolean(),
	/** Required when enabling either feature. */
	affirmed: z.literal(true).optional(),
	requestId: RequestIdSchema,
});

export const FeatureEnablementEnableSchema = z.object({
	action: z.literal("enable"),
	feature: FeatureEnablementFeatureSchema,
	affirmed: z.literal(true),
	requestId: RequestIdSchema,
});

export const FeatureEnablementDisableSchema = z.object({
	action: z.literal("disable"),
	feature: FeatureEnablementFeatureSchema,
	requestId: RequestIdSchema,
});

export const FeatureEnablementEraseSchema = z.object({
	action: z.literal("erase"),
	dataset: z.enum(["goals", "intake", "all"]),
	requestId: RequestIdSchema,
});

export const FeatureEnablementActionSchema = z.discriminatedUnion("action", [
	FeatureEnablementSetSchema,
	FeatureEnablementEnableSchema,
	FeatureEnablementDisableSchema,
	FeatureEnablementEraseSchema,
]);

export type FeatureEnablementAction = z.infer<
	typeof FeatureEnablementActionSchema
>;
