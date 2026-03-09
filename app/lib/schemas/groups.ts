import { z } from "zod";

export const RoleUpdateSchema = z.object({
	role: z.enum(["admin", "member"]),
});

export type RoleUpdateInput = z.infer<typeof RoleUpdateSchema>;
