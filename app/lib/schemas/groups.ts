import { z } from "zod";

export const RoleUpdateSchema = z.object({
	role: z.enum(["admin", "member"]),
});

export type RoleUpdateInput = z.infer<typeof RoleUpdateSchema>;

export const TransferOwnershipSchema = z.object({
	newOwnerMemberId: z.string().uuid(),
});

export type TransferOwnershipInput = z.infer<typeof TransferOwnershipSchema>;
