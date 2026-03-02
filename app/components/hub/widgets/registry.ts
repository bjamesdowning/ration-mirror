import type { ComponentType } from "react";
import type {
	HubProfile,
	HubWidgetId,
	HubWidgetLayout,
	HubWidgetProps,
	UserSettings,
} from "~/lib/types";
import { CargoExpiringWidget } from "./CargoExpiringWidget";
import { HubStatsWidget } from "./HubStatsWidget";
import { ManifestWidget } from "./ManifestWidget";
import { MealsPartialWidget } from "./MealsPartialWidget";
import { MealsReadyWidget } from "./MealsReadyWidget";
import { SnacksReadyWidget } from "./SnacksReadyWidget";
import { SupplyPreviewWidget } from "./SupplyPreviewWidget";

export type { HubWidgetId, HubProfile, HubWidgetLayout, HubWidgetProps };

export interface HubWidgetDefinition {
	id: HubWidgetId;
	title: string;
	description: string;
	dataKeys: string[];
	component: ComponentType<HubWidgetProps>;
	defaultSize: "sm" | "md" | "lg";
	/** If true, widget receives deferred data (Promise); must use Suspense + Await */
	defer?: boolean;
}

export const WIDGET_REGISTRY = new Map<HubWidgetId, HubWidgetDefinition>([
	[
		"hub-stats",
		{
			id: "hub-stats",
			title: "Quick Stats",
			description:
				"Cargo count, expiring, meals ready, snacks ready, supply count",
			dataKeys: [
				"cargoStats",
				"mealMatches",
				"snackMatches",
				"latestSupplyList",
			],
			component: HubStatsWidget,
			defaultSize: "lg",
		},
	],
	[
		"meals-ready",
		{
			id: "meals-ready",
			title: "Meals Ready",
			description: "Meals you can make with current Cargo",
			dataKeys: ["mealMatches"],
			component: MealsReadyWidget,
			defaultSize: "lg",
			defer: true,
		},
	],
	[
		"meals-partial",
		{
			id: "meals-partial",
			title: "Partial Meals",
			description: "Meals with 50%+ match, missing some ingredients",
			dataKeys: ["partialMealMatches"],
			component: MealsPartialWidget,
			defaultSize: "lg",
			defer: true,
		},
	],
	[
		"snacks-ready",
		{
			id: "snacks-ready",
			title: "Snacks Ready",
			description: "Provisions you can have with current Cargo",
			dataKeys: ["snackMatches"],
			component: SnacksReadyWidget,
			defaultSize: "lg",
			defer: true,
		},
	],
	[
		"cargo-expiring",
		{
			id: "cargo-expiring",
			title: "Expiring Cargo",
			description: "Items expiring within alert window",
			dataKeys: ["expiringItems", "expirationAlertDays"],
			component: CargoExpiringWidget,
			defaultSize: "md",
		},
	],
	[
		"supply-preview",
		{
			id: "supply-preview",
			title: "Supply Preview",
			description: "Current Supply List progress",
			dataKeys: ["latestSupplyList"],
			component: SupplyPreviewWidget,
			defaultSize: "md",
		},
	],
	[
		"manifest-preview",
		{
			id: "manifest-preview",
			title: "Manifest",
			description: "Your upcoming meal plan at a glance",
			dataKeys: ["manifestPreview"],
			component: ManifestWidget,
			defaultSize: "md",
		},
	],
]);

const FULL_LAYOUT: HubWidgetLayout[] = [
	{ id: "hub-stats", order: 0, size: "lg", visible: true },
	{ id: "meals-ready", order: 1, size: "lg", visible: true },
	{ id: "meals-partial", order: 2, size: "lg", visible: true },
	{ id: "snacks-ready", order: 3, size: "lg", visible: true },
	{ id: "cargo-expiring", order: 4, size: "md", visible: true },
	{ id: "supply-preview", order: 5, size: "md", visible: true },
	{ id: "manifest-preview", order: 6, size: "md", visible: true },
];

const COOK_LAYOUT: HubWidgetLayout[] = [
	{ id: "hub-stats", order: 0, size: "lg", visible: true },
	{ id: "meals-ready", order: 1, size: "lg", visible: true },
	{ id: "snacks-ready", order: 2, size: "lg", visible: true },
	{ id: "cargo-expiring", order: 3, size: "md", visible: true },
	{ id: "manifest-preview", order: 4, size: "sm", visible: true },
];

const SHOP_LAYOUT: HubWidgetLayout[] = [
	{ id: "hub-stats", order: 0, size: "lg", visible: true },
	{ id: "supply-preview", order: 1, size: "md", visible: true },
	{ id: "manifest-preview", order: 2, size: "md", visible: true },
	{ id: "meals-partial", order: 3, size: "lg", visible: true },
];

const MINIMAL_LAYOUT: HubWidgetLayout[] = [
	{ id: "hub-stats", order: 0, size: "lg", visible: true },
	{ id: "meals-ready", order: 1, size: "lg", visible: true },
];

export const PROFILE_PRESETS: Record<
	Exclude<HubProfile, "custom">,
	HubWidgetLayout[]
> = {
	full: FULL_LAYOUT,
	cook: COOK_LAYOUT,
	shop: SHOP_LAYOUT,
	minimal: MINIMAL_LAYOUT,
};

export interface ResolvedWidgetLayout extends HubWidgetLayout {
	id: HubWidgetId;
}

export function resolveLayout(
	profile: HubProfile | undefined,
	hubLayout: UserSettings["hubLayout"] | undefined,
): ResolvedWidgetLayout[] {
	if (profile === "custom" && hubLayout?.widgets?.length) {
		return hubLayout.widgets
			.filter((w) => WIDGET_REGISTRY.has(w.id as HubWidgetId))
			.map((w) => ({
				...w,
				id: w.id as HubWidgetId,
				size:
					w.size ??
					WIDGET_REGISTRY.get(w.id as HubWidgetId)?.defaultSize ??
					"md",
			})) as ResolvedWidgetLayout[];
	}
	const presetProfile = (profile ?? "full") as Exclude<HubProfile, "custom">;
	const preset = PROFILE_PRESETS[presetProfile] ?? FULL_LAYOUT;
	return (preset?.length ? preset : FULL_LAYOUT) as ResolvedWidgetLayout[];
}
