import {
	type HubWidgetId,
	PROFILE_PRESETS,
	WIDGET_REGISTRY,
} from "~/components/hub/widgets/registry";
import type {
	HubProfile,
	HubWidgetFilters,
	HubWidgetLayout,
} from "~/lib/types";

export function initEditableWidgets(
	hubProfile: HubProfile | undefined,
	hubLayout: { widgets: HubWidgetLayout[] } | undefined,
): HubWidgetLayout[] {
	let base: HubWidgetLayout[];

	if (hubProfile === "custom" && hubLayout?.widgets?.length) {
		base = hubLayout.widgets
			.filter((w) => WIDGET_REGISTRY.has(w.id as HubWidgetId))
			.map((w) => ({ ...w }));
	} else {
		const presetKey = (hubProfile ?? "full") as Exclude<HubProfile, "custom">;
		const preset = PROFILE_PRESETS[presetKey] ?? PROFILE_PRESETS.full;
		base = preset.map((w) => ({ ...w }));
	}

	// Ensure all registered widgets are present so users can re-enable hidden widgets.
	const included = new Set(base.map((w) => w.id));
	for (const [id, def] of WIDGET_REGISTRY) {
		if (!included.has(id)) {
			base.push({
				id,
				order: base.length,
				size: def.defaultSize,
				visible: false,
			});
		}
	}

	return base.sort((a, b) => a.order - b.order);
}

export function moveWidget(
	widgets: HubWidgetLayout[],
	id: string,
	direction: "up" | "down",
): HubWidgetLayout[] {
	const idx = widgets.findIndex((w) => w.id === id);
	if (idx < 0) return widgets;

	const swapIdx = direction === "up" ? idx - 1 : idx + 1;
	if (swapIdx < 0 || swapIdx >= widgets.length) return widgets;

	const next = [...widgets];
	[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
	return next.map((w, i) => ({ ...w, order: i }));
}

export function toggleWidgetVisibility(
	widgets: HubWidgetLayout[],
	id: string,
): HubWidgetLayout[] {
	return widgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w));
}

export function setWidgetSize(
	widgets: HubWidgetLayout[],
	id: string,
	size: "sm" | "md" | "lg",
): HubWidgetLayout[] {
	return widgets.map((w) => (w.id === id ? { ...w, size } : w));
}

export function hasActiveWidgetFilters(filters: HubWidgetFilters | undefined) {
	if (!filters) return false;
	return Object.values(filters).some(
		(value) =>
			value !== undefined && !(Array.isArray(value) && value.length === 0),
	);
}

export function setWidgetFilters(
	widgets: HubWidgetLayout[],
	id: string,
	filters: HubWidgetFilters,
): HubWidgetLayout[] {
	const cleaned = cleanWidgetFilters(filters);
	const hasAnyFilters = Object.keys(cleaned).length > 0;
	return widgets.map((w) =>
		w.id === id ? { ...w, filters: hasAnyFilters ? cleaned : undefined } : w,
	);
}

export function createHubLayoutFormData(widgets: HubWidgetLayout[]) {
	const formData = new FormData();
	formData.set("intent", "update-hub-layout");
	formData.set("hubLayout", JSON.stringify({ widgets }));
	return formData;
}

function cleanWidgetFilters(filters: HubWidgetFilters): HubWidgetFilters {
	return Object.fromEntries(
		Object.entries(filters).filter(([, value]) => {
			if (value === undefined) return false;
			if (Array.isArray(value)) return value.length > 0;
			return true;
		}),
	) as HubWidgetFilters;
}
