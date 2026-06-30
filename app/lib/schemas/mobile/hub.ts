import { z } from "zod";
import { HubLayoutSchema } from "~/lib/schemas/hub";

const HubProfileSchema = z.enum(["cook", "shop", "minimal", "full", "custom"]);

const CargoStatsSchema = z.object({
	totalItems: z.number(),
	expiringCount: z.number(),
	expiredCount: z.number().optional(),
});

const ExpiringCargoItemSchema = z
	.object({
		id: z.string(),
		name: z.string(),
	})
	.passthrough();

const SupplyItemPreviewSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		isPurchased: z.boolean().optional(),
	})
	.passthrough();

const SupplyListPreviewSchema = z
	.object({
		id: z.string(),
		items: z.array(SupplyItemPreviewSchema),
	})
	.passthrough()
	.nullable();

const ManifestPreviewEntrySchema = z.object({
	entryId: z.string(),
	date: z.string(),
	slotType: z.string(),
	mealName: z.string(),
	mealId: z.string(),
	mealType: z.string().optional(),
	servingsOverride: z.number().nullable().optional(),
});

const ManifestPreviewSchema = z
	.object({
		planId: z.string().nullable(),
		entries: z.array(ManifestPreviewEntrySchema).max(50),
	})
	.nullable();

const MealMatchResultSchema = z
	.object({
		matchPercentage: z.number(),
		canMake: z.boolean(),
		meal: z.object({ id: z.string(), name: z.string() }).passthrough(),
	})
	.passthrough();

export const MobileHubResponseSchema = z.object({
	expiringItems: z.array(ExpiringCargoItemSchema),
	cargoStats: CargoStatsSchema,
	latestSupplyList: SupplyListPreviewSchema,
	manifestPreview: ManifestPreviewSchema,
	expirationAlertDays: z.number().int().min(1).max(90),
	hubProfile: HubProfileSchema.optional(),
	hubLayout: HubLayoutSchema.optional(),
	availableMealTags: z.array(z.string()),
	availableCargoTags: z.array(z.string()).optional(),
	mealMatches: z.array(MealMatchResultSchema),
	partialMealMatches: z.array(MealMatchResultSchema),
	snackMatches: z.array(MealMatchResultSchema),
});

export type MobileHubResponse = z.infer<typeof MobileHubResponseSchema>;
