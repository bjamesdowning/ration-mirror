import { z } from "zod";

export const RevenueCatWebhookEventSchema = z.object({
	event: z.object({
		type: z.string(),
		id: z.string(),
		app_user_id: z.string().min(1),
		product_id: z.string().optional(),
		entitlement_ids: z.array(z.string()).optional(),
		expiration_at_ms: z.number().optional(),
		store: z.string().optional(),
	}),
});
