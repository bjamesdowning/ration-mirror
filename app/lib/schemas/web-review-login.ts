import { z } from "zod";

export const WebReviewLoginSchema = z.object({
	email: z.string().trim().email(),
	password: z.string().min(1).max(256),
	callbackURL: z.string().max(2048).optional(),
});

export type WebReviewLoginInput = z.infer<typeof WebReviewLoginSchema>;
