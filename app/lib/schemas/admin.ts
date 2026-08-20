import { z } from "zod";

export const ToggleAdminSchema = z.object({
	intent: z.literal("toggle-admin"),
	userId: z.string().min(1),
});

export type ToggleAdminInput = z.infer<typeof ToggleAdminSchema>;

export const RetryPurgeJobSchema = z.object({
	intent: z.literal("retry-purge-job"),
	jobId: z.string().uuid(),
	confirmValue: z.string().trim().min(1).max(320),
});

export type RetryPurgeJobInput = z.infer<typeof RetryPurgeJobSchema>;

export const AdminUsersListSchema = z.object({
	q: z.string().optional(),
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(25),
	sort: z
		.enum(["createdAt", "lastLogin", "lastActive", "name"])
		.default("createdAt"),
	order: z.enum(["asc", "desc"]).default("desc"),
});

export type AdminUsersListInput = z.infer<typeof AdminUsersListSchema>;
