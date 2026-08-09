import { z } from "zod";
import { NUTRITION_CONSENT_PURPOSES } from "../nutrition/consent-policy";

const RequestIdSchema = z.string().uuid();

export const NutritionConsentGrantSchema = z.object({
	action: z.literal("grant"),
	purpose: z.enum(NUTRITION_CONSENT_PURPOSES),
	policyVersion: z.string().min(1).max(100),
	statementVersion: z.string().min(1).max(100),
	statementSha256: z.string().regex(/^[a-f0-9]{64}$/),
	affirmed: z.literal(true),
	requestId: RequestIdSchema,
});

export const NutritionConsentWithdrawSchema = z.object({
	action: z.literal("withdraw"),
	purpose: z.enum(NUTRITION_CONSENT_PURPOSES),
	requestId: RequestIdSchema,
});

export const NutritionDataEraseSchema = z.object({
	action: z.literal("erase"),
	dataset: z.enum(["goals", "intake", "all"]),
	requestId: RequestIdSchema,
});

export const NutritionPrivacyActionSchema = z.discriminatedUnion("action", [
	NutritionConsentGrantSchema,
	NutritionConsentWithdrawSchema,
	NutritionDataEraseSchema,
]);

export type NutritionConsentGrantInput = z.infer<
	typeof NutritionConsentGrantSchema
>;
export type NutritionConsentWithdrawInput = z.infer<
	typeof NutritionConsentWithdrawSchema
>;
export type NutritionDataEraseInput = z.infer<typeof NutritionDataEraseSchema>;
