import { z } from "zod";

export const AccountDeletionPreviewSchema = z.object({
	ownedGroupsWithNoOtherMembers: z.array(z.string()),
	canDelete: z.boolean(),
	blockReason: z.enum(["active_subscription"]).nullable(),
	cancelAtPeriodEnd: z.boolean(),
	tierExpiresAt: z.string().nullable(),
	message: z.string(),
	managementUrl: z.string().nullable(),
	billingProvider: z.string().nullable(),
});

export type AccountDeletionPreview = z.infer<
	typeof AccountDeletionPreviewSchema
>;
