import { z } from "zod";
import { HubLayoutSchema } from "~/lib/schemas/hub";
import { kitchenEventTypeSchema } from "~/lib/schemas/kitchen-events";
import { NutritionSummarySchema } from "~/lib/schemas/nutrition";

const HubProfileSchema = z.enum(["cook", "shop", "minimal", "full", "custom"]);

const CargoStatsSchema = z.object({
	totalItems: z.number().int(),
	expiringCount: z.number().int(),
	expiredCount: z.number().int().optional(),
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
		itemCount: z.number().int().optional(),
		uncheckedCount: z.number().int().optional(),
		purchasedCount: z.number().int().optional(),
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
	servingsOverride: z.number().int().nullable().optional(),
});

const ManifestPreviewSchema = z
	.object({
		planId: z.string().nullable(),
		entries: z.array(ManifestPreviewEntrySchema).max(50),
	})
	.nullable();

const MobileMealIngredientSchema = z
	.object({
		id: z.string(),
		orderIndex: z.number().int().nullable().optional(),
	})
	.passthrough();

const MobileMealSchema = z
	.object({
		id: z.string(),
		servings: z.number().int().nullable().optional(),
		prepTime: z.number().int().nullable().optional(),
		cookTime: z.number().int().nullable().optional(),
		ingredients: z.array(MobileMealIngredientSchema).optional(),
	})
	.passthrough();

export const MobileHubMealMatchSchema = z
	.object({
		matchPercentage: z.number(),
		canMake: z.boolean(),
		meal: MobileMealSchema,
	})
	.passthrough();

const FlightRecorderActivitySchema = z.object({
	stats: z.object({
		window: z.enum(["7d", "30d", "90d", "365d"]),
		from: z.iso.datetime(),
		to: z.iso.datetime(),
		countsByType: z.record(z.string(), z.number().int()),
		topCookedMeals: z.array(
			z.object({
				subjectName: z.string(),
				mealId: z.string().nullable(),
				count: z.number().int(),
			}),
		),
		totals: z.object({
			cooked: z.number().int(),
			docked: z.number().int(),
			expired: z.number().int(),
			jettisoned: z.number().int(),
		}),
	}),
	recent: z.array(
		z
			.object({
				id: z.string(),
				eventType: kitchenEventTypeSchema,
				occurredAt: z.iso.datetime(),
				subjectName: z.string(),
				mealId: z.string().nullable().optional(),
				cargoId: z.string().nullable().optional(),
			})
			.passthrough(),
	),
});

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
	cargoTagIndex: z
		.array(z.object({ id: z.string(), name: z.string() }).passthrough())
		.optional(),
	mealMatches: z.array(MobileHubMealMatchSchema),
	partialMealMatches: z.array(MobileHubMealMatchSchema),
	snackMatches: z.array(MobileHubMealMatchSchema),
	flightRecorderActivity: FlightRecorderActivitySchema.nullable().optional(),
	nutritionToday: NutritionSummarySchema.nullable().optional(),
	nutritionTrends: NutritionSummarySchema.nullable().optional(),
});

export type MobileHubResponse = z.infer<typeof MobileHubResponseSchema>;
