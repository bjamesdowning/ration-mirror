import { z } from "zod";

const HUB_WIDGET_IDS = [
	"hub-stats",
	"meals-ready",
	"meals-partial",
	"snacks-ready",
	"cargo-expiring",
	"supply-preview",
	"manifest-preview",
] as const;

export const SLOT_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;

export const CARGO_DOMAINS = ["food", "household", "alcohol"] as const;

export const HubWidgetFiltersSchema = z.object({
	/** Meal tag slugs to include (OR logic). Max 5 tags. Applies to meals-ready, meals-partial, snacks-ready, manifest-preview. */
	tags: z.array(z.string().min(1).max(50)).max(5).optional(),
	/** Restrict manifest-preview to a single meal slot. */
	slotType: z.enum(SLOT_TYPES).optional(),
	/** Restrict cargo-expiring widget to a single domain. */
	domain: z.enum(CARGO_DOMAINS).optional(),
	/** Override the default result limit for this widget. 1–20. */
	limit: z.number().int().min(1).max(20).optional(),
});

export const HubWidgetLayoutSchema = z.object({
	id: z.enum(HUB_WIDGET_IDS),
	order: z.number().int().min(0),
	size: z.enum(["sm", "md", "lg"]).optional(),
	visible: z.boolean(),
	filters: HubWidgetFiltersSchema.optional(),
});

export const HubLayoutSchema = z.object({
	widgets: z.array(HubWidgetLayoutSchema).max(20),
});

export type HubWidgetFilters = z.infer<typeof HubWidgetFiltersSchema>;
export type HubWidgetLayoutFromSchema = z.infer<typeof HubWidgetLayoutSchema>;
