import { z } from "zod";

/**
 * Fin Data Connector POST body for subscription cancel/resume.
 * `confirm` must be true so accidental connector calls cannot mutate billing.
 */
export const FinSubscriptionMutationBodySchema = z.object({
	user_id: z
		.string()
		.min(1)
		.max(128)
		.refine((s) => !/\s/.test(s), "user_id must not contain whitespace"),
	confirm: z.literal(true),
});

export type FinSubscriptionMutationBody = z.infer<
	typeof FinSubscriptionMutationBodySchema
>;
