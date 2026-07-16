import { z } from "zod";

export const RoleUpdateSchema = z.object({
	role: z.enum(["admin", "member"]),
});

export type RoleUpdateInput = z.infer<typeof RoleUpdateSchema>;

export const TransferOwnershipSchema = z.object({
	// Better Auth member IDs are alphanumeric (not always UUIDs); membership is verified in-route.
	newOwnerMemberId: z.string().min(1),
});

export type TransferOwnershipInput = z.infer<typeof TransferOwnershipSchema>;
