import { z } from "zod";
import { ITEM_DOMAINS } from "~/lib/domain";
import { MealSchema } from "~/lib/schemas/meal";

export const MobileCreateMealSchema = MealSchema;

export const MobileUpdateMealSchema = MealSchema;

export const MobileMealsListQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(50),
	tag: z.string().optional(),
	domain: z.enum(ITEM_DOMAINS).optional(),
});

export type MobileMealsListQuery = z.infer<typeof MobileMealsListQuerySchema>;
