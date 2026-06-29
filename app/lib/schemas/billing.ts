import { z } from "zod";

export const RevenueCatWebhookEventSchema = z.object({
	api_version: z.string().optional(),
	event: z.object({
		type: z.string(),
		id: z.string(),
		app_user_id: z.string().min(1),
		// RevenueCat sends explicit `null` on many fields; `.optional()` alone rejects null.
		product_id: z.string().nullish(),
		entitlement_ids: z.array(z.string()).nullish(),
		expiration_at_ms: z.number().nullish(),
		store: z.string().nullish(),
	}),
});
