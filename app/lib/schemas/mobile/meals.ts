import { z } from "zod";
import { ITEM_DOMAINS } from "~/lib/domain";
import { MealSchema, ProvisionSchema } from "~/lib/schemas/meal";
import { SearchQuerySchema } from "~/lib/schemas/search";

export const MobileCreateMealSchema = MealSchema;

export const MobileUpdateMealSchema = MealSchema.partial();

export const MobileProvisionSchema = ProvisionSchema;

export const MobileMealsListQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(50),
	tag: z.string().optional(),
	domain: z.enum(ITEM_DOMAINS).optional(),
	q: SearchQuerySchema.optional(),
});

export type MobileMealsListQuery = z.infer<typeof MobileMealsListQuerySchema>;
