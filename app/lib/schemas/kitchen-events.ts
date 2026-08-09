import { z } from "zod";

/** Surface that triggered a user-facing kitchen action. */
export const kitchenEventSourceSchema = z.enum([
	"web",
	"mobile",
	"mcp",
	"copilot",
	"system",
]);
export type KitchenEventSource = z.infer<typeof kitchenEventSourceSchema>;

const deductedItemSchema = z.object({
	cargoId: z.string(),
	quantity: z.number(),
});

export const galleyCookedPayloadSchema = z.object({
	servings: z.number(),
	deductions: z.array(deductedItemSchema).default([]),
	partialCook: z.boolean().optional(),
	source: kitchenEventSourceSchema.optional(),
});
export type GalleyCookedPayload = z.infer<typeof galleyCookedPayloadSchema>;

export const manifestConsumedPayloadSchema = z.object({
	planId: z.string(),
	entryIds: z.array(z.string()).min(1),
	date: z.string().optional(),
	slotType: z.string().optional(),
	servings: z.number(),
	deductions: z.array(deductedItemSchema).default([]),
	partialCook: z.boolean().optional(),
	source: kitchenEventSourceSchema.optional(),
	/** Logged intake energy when nutrition-manifest plate-up ran. */
	energyKcal: z.number().optional(),
	portionServings: z.number().optional(),
	manifestDate: z.string().optional(),
	verified: z.boolean().optional(),
});
export type ManifestConsumedPayload = z.infer<
	typeof manifestConsumedPayloadSchema
>;

export const supplyDockedPayloadSchema = z.object({
	quantity: z.number(),
	unit: z.string(),
	domain: z.string().optional(),
	sourceCargoId: z.string().nullable().optional(),
	source: kitchenEventSourceSchema.optional(),
});
export type SupplyDockedPayload = z.infer<typeof supplyDockedPayloadSchema>;

export const cargoExpiredPayloadSchema = z.object({
	quantity: z.number(),
	unit: z.string(),
	expiresAt: z.string(),
	domain: z.string().optional(),
});
export type CargoExpiredPayload = z.infer<typeof cargoExpiredPayloadSchema>;

export const cargoJettisonedPayloadSchema = z.object({
	quantity: z.number(),
	unit: z.string(),
	domain: z.string().optional(),
	wasExpired: z.boolean(),
	expiresAt: z.string().nullable().optional(),
	source: kitchenEventSourceSchema.optional(),
});
export type CargoJettisonedPayload = z.infer<
	typeof cargoJettisonedPayloadSchema
>;

export const KITCHEN_EVENT_TYPES = [
	"galley_cooked",
	"manifest_consumed",
	"supply_docked",
	"cargo_expired",
	"cargo_jettisoned",
] as const;

export type KitchenEventType = (typeof KITCHEN_EVENT_TYPES)[number];

export const kitchenEventTypeSchema = z.enum(KITCHEN_EVENT_TYPES);
