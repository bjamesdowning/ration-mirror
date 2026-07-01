import { z } from "zod";

export const UndoActionSchema = z.object({
	token: z.string().uuid(),
});

export type UndoActionInput = z.infer<typeof UndoActionSchema>;
