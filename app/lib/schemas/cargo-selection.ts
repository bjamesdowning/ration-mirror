import { z } from "zod";

export const CargoRestockQuantitySchema = z.object({
	quantity: z.coerce.number().positive().max(9999).optional(),
});

export type CargoRestockQuantityInput = z.infer<
	typeof CargoRestockQuantitySchema
>;
