import { z } from "zod";
import {
	RoleUpdateSchema,
	TransferOwnershipSchema,
} from "~/lib/schemas/groups";

export { RoleUpdateSchema, TransferOwnershipSchema };

export const MobileCreateGroupSchema = z.object({
	name: z.string().trim().min(1, "Name is required").max(100),
	slug: z
		.string()
		.min(1)
		.regex(
			/^[a-z0-9-]+$/,
			"Unique ID must contain only lowercase letters, numbers, and hyphens",
		)
		.optional(),
});

export type MobileCreateGroupInput = z.infer<typeof MobileCreateGroupSchema>;

export const MobileDeleteGroupSchema = z.object({
	organizationId: z.string().min(1, "Organization ID is required"),
	confirmSlug: z.string().optional(),
});

export type MobileDeleteGroupInput = z.infer<typeof MobileDeleteGroupSchema>;
