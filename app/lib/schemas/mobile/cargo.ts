import { z } from "zod";
import { CargoItemSchema, PartialCargoItemSchema } from "~/lib/cargo.server";

export const MobileCargoListQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(50),
	cursor: z.string().optional(),
	domain: z.enum(["food", "household", "alcohol"]).optional(),
});

export const MobileCreateCargoSchema = CargoItemSchema;

export const MobileUpdateCargoSchema = PartialCargoItemSchema;
