/**
 * Loose MCP output schemas for the five read tools whose structuredContent
 * is validated by the SDK. Extra fields pass. Error envelopes set isError
 * and skip this check.
 */

import { z } from "zod";

const looseRecord = z.record(z.string(), z.unknown());

function successEnvelope(data: z.ZodType) {
	return z
		.object({
			ok: z.literal(true),
			tool: z.string(),
			data,
			warnings: z.array(z.string()).optional(),
			meta: looseRecord.optional(),
			outcome: z.string().optional(),
			requestId: z.string().optional(),
			operationId: z.string().optional(),
			retryable: z.boolean().optional(),
			retryAfterMs: z.number().optional(),
		})
		.loose();
}

const mealIndexItem = z
	.object({
		id: z.string(),
		name: z.string(),
		type: z.string().optional(),
		servings: z.number().optional(),
		domain: z.string().optional(),
		tags: z.array(z.string()).optional(),
		nutritionStatus: z.string().optional(),
		nutrition: looseRecord.optional(),
		ingredients: z.array(looseRecord).optional(),
	})
	.loose();

export const listMealsOutputSchema = successEnvelope(z.array(mealIndexItem));

export const getMealPlanOutputSchema = successEnvelope(
	z
		.object({
			planId: z.string(),
			planName: z.string().nullable().optional(),
			startDate: z.string(),
			endDate: z.string(),
			entries: z.array(looseRecord),
		})
		.loose()
		.nullable(),
);

export const getSupplyListOutputSchema = successEnvelope(
	z
		.object({
			id: z.string(),
			name: z.string(),
			items: z.array(looseRecord),
		})
		.loose()
		.nullable(),
);

export const getKitchenSummaryOutputSchema = successEnvelope(looseRecord);

export const matchMealsOutputSchema = successEnvelope(z.array(looseRecord));
