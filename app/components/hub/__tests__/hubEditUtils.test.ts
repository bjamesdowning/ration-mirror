import { describe, expect, it } from "vitest";
import {
	createHubLayoutFormData,
	hasActiveWidgetFilters,
	initEditableWidgets,
	moveWidget,
	setWidgetFilters,
	setWidgetSize,
	toggleWidgetVisibility,
} from "~/components/hub/hubEditUtils";
import { WIDGET_REGISTRY } from "~/components/hub/widgets/registry";
import type { HubWidgetLayout } from "~/lib/types";

describe("hubEditUtils", () => {
	it("includes every registry widget in editable layout", () => {
		const widgets = initEditableWidgets("custom", {
			widgets: [{ id: "hub-stats", order: 0, size: "lg", visible: true }],
		});

		expect(widgets.length).toBe(WIDGET_REGISTRY.size);
		const unknown = widgets.find(
			(widget) =>
				!WIDGET_REGISTRY.has(
					widget.id as Parameters<typeof WIDGET_REGISTRY.has>[0],
				),
		);
		expect(unknown).toBeUndefined();

		const injected = widgets.find((widget) => widget.id === "meals-ready");
		expect(injected?.visible).toBe(false);
	});

	it("moves a widget and recalculates order indexes", () => {
		const widgets: HubWidgetLayout[] = [
			{ id: "hub-stats", order: 0, size: "lg", visible: true },
			{ id: "meals-ready", order: 1, size: "lg", visible: true },
			{ id: "cargo-expiring", order: 2, size: "md", visible: true },
		];

		const moved = moveWidget(widgets, "meals-ready", "down");
		expect(moved.map((widget) => widget.id)).toEqual([
			"hub-stats",
			"cargo-expiring",
			"meals-ready",
		]);
		expect(moved.map((widget) => widget.order)).toEqual([0, 1, 2]);
	});

	it("does not move past boundaries", () => {
		const widgets: HubWidgetLayout[] = [
			{ id: "hub-stats", order: 0, size: "lg", visible: true },
			{ id: "meals-ready", order: 1, size: "lg", visible: true },
		];

		expect(moveWidget(widgets, "hub-stats", "up")).toBe(widgets);
		expect(moveWidget(widgets, "meals-ready", "down")).toBe(widgets);
	});

	it("toggles visibility and updates size", () => {
		const widgets: HubWidgetLayout[] = [
			{ id: "hub-stats", order: 0, size: "lg", visible: true },
		];

		const hidden = toggleWidgetVisibility(widgets, "hub-stats");
		expect(hidden[0]?.visible).toBe(false);

		const resized = setWidgetSize(hidden, "hub-stats", "sm");
		expect(resized[0]?.size).toBe("sm");
	});

	it("cleans empty filters before persisting", () => {
		const widgets: HubWidgetLayout[] = [
			{ id: "meals-ready", order: 0, size: "lg", visible: true },
		];

		const updated = setWidgetFilters(widgets, "meals-ready", {
			tags: [],
			limit: 6,
			domain: undefined,
		});
		expect(updated[0]?.filters).toEqual({ limit: 6 });
		expect(hasActiveWidgetFilters(updated[0]?.filters)).toBe(true);

		const cleared = setWidgetFilters(widgets, "meals-ready", { tags: [] });
		expect(cleared[0]?.filters).toBeUndefined();
		expect(hasActiveWidgetFilters(cleared[0]?.filters)).toBe(false);
	});

	it("creates hub layout form data payload", () => {
		const widgets: HubWidgetLayout[] = [
			{ id: "hub-stats", order: 0, size: "lg", visible: true },
		];

		const formData = createHubLayoutFormData(widgets);
		expect(formData.get("intent")).toBe("update-hub-layout");
		expect(formData.get("hubLayout")).toBe(
			JSON.stringify({
				widgets,
			}),
		);
	});
});
