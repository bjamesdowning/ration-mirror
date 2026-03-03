import { z } from "zod";

export const InterestSignupSchema = z.object({
	email: z.string().email(),
	source: z.string().max(50).optional(),
});
