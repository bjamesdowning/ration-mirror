import { z } from "zod";

/**
 * Schema for creating an API key (POST /api/api-keys).
 */
export const CreateApiKeySchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.max(100, "Name must be at most 100 characters")
		.trim(),
});

export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;
