import { z } from "zod";

export const OrganizationProfilePatchSchema = z.object({
	name: z.string().trim().min(1).max(100),
});

export type OrganizationProfilePatch = z.infer<
	typeof OrganizationProfilePatchSchema
>;
