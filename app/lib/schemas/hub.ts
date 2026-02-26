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

export const HubWidgetLayoutSchema = z.object({
	id: z.enum(HUB_WIDGET_IDS),
	order: z.number().int().min(0),
	size: z.enum(["sm", "md", "lg"]).optional(),
	visible: z.boolean(),
});

export const HubLayoutSchema = z.object({
	widgets: z.array(HubWidgetLayoutSchema).max(20),
});
