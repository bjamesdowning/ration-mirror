import { z } from "zod";

export const VALID_API_SCOPES = [
	"inventory",
	"galley",
	"supply",
	"mcp",
] as const;

export type ApiScope = (typeof VALID_API_SCOPES)[number];

/**
 * Schema for creating an API key (POST /api/api-keys).
 */
export const CreateApiKeySchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.max(100, "Name must be at most 100 characters")
		.trim(),
	scopes: z
		.array(z.enum(VALID_API_SCOPES))
		.min(1, "At least one scope is required"),
});

export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;
