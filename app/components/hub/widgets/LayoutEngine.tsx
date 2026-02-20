import type { HubLoaderData, HubWidgetId } from "~/lib/types";
import {
	PROFILE_PRESETS,
	type ResolvedWidgetLayout,
	WIDGET_REGISTRY,
} from "./registry";

interface LayoutEngineProps {
	layout: ResolvedWidgetLayout[];
	data: HubLoaderData;
}

function getColSpanClass(size: "sm" | "md" | "lg"): string {
	switch (size) {
		case "sm":
			return "md:col-span-4"; // 1/3 width on desktop
		case "md":
			return "md:col-span-6"; // half width on desktop
		case "lg":
			return "md:col-span-12"; // full width on desktop
		default:
			return "md:col-span-6";
	}
}

export function LayoutEngine({ layout, data }: LayoutEngineProps) {
	const visibleLayout = layout
		.filter((w) => w.visible)
		.sort((a, b) => a.order - b.order);

	const widgetsToRender = visibleLayout.filter((w) =>
		WIDGET_REGISTRY.has(w.id as HubWidgetId),
	);

	const resolvedLayout =
		widgetsToRender.length > 0
			? widgetsToRender
			: (PROFILE_PRESETS.full as ResolvedWidgetLayout[]);

	return (
		<div className="grid grid-cols-1 md:grid-cols-12 gap-6">
			{resolvedLayout.map((item) => {
				const def = WIDGET_REGISTRY.get(item.id as HubWidgetId);
				if (!def) return null;
				const WidgetComponent = def.component;
				const size = item.size ?? def.defaultSize;
				return (
					<div key={item.id} className={getColSpanClass(size)}>
						<WidgetComponent data={data} size={size} />
					</div>
				);
			})}
		</div>
	);
}
