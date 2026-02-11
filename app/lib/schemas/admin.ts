import { z } from "zod";

export const ToggleAdminSchema = z.object({
	intent: z.literal("toggle-admin"),
	userId: z.string().min(1),
});

export type ToggleAdminInput = z.infer<typeof ToggleAdminSchema>;
