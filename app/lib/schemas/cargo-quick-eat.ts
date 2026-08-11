import { z } from "zod";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const CargoQuickEatRequestSchema = z.object({
	quantity: z.coerce.number().positive().max(1_000_000),
	unit: z.string().trim().min(1).max(32).optional(),
	date: z.string().regex(ISO_DATE_REGEX),
	operationKey: z.string().uuid(),
	logIntake: z.boolean().optional(),
});

export type CargoQuickEatRequest = z.infer<typeof CargoQuickEatRequestSchema>;
