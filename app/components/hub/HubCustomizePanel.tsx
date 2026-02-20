import { Form, useFetcher } from "react-router";
import {
	type HubWidgetDefinition,
	PROFILE_PRESETS,
	WIDGET_REGISTRY,
} from "~/components/hub/widgets/registry";
import type { HubProfile, HubWidgetId, HubWidgetLayout } from "~/lib/types";

interface HubCustomizePanelProps {
	hubProfile?: HubProfile;
	hubLayout?: { widgets: HubWidgetLayout[] };
}

const PROFILE_LABELS: Record<HubProfile, string> = {
	full: "Full",
	cook: "Cook",
	shop: "Shop",
	minimal: "Minimal",
	custom: "Custom",
};

const SIZE_OPTIONS = ["sm", "md", "lg"] as const;

function getWidgetsForProfile(
	profile: Exclude<HubProfile, "custom">,
): HubWidgetLayout[] {
	const preset = PROFILE_PRESETS[profile];
	if (preset?.length) return preset.map((w) => ({ ...w }));
	return PROFILE_PRESETS.full.map((w) => ({ ...w }));
}

function getEditableWidgets(
	profile: HubProfile,
	hubLayout: HubCustomizePanelProps["hubLayout"],
): HubWidgetLayout[] {
	if (profile === "custom" && hubLayout?.widgets?.length) {
		const ids = new Set(WIDGET_REGISTRY.keys());
		const fromLayout = hubLayout.widgets
			.filter((w) => ids.has(w.id as HubWidgetId))
			.map((w) => ({ ...w }));
		const fromLayoutIds = new Set(fromLayout.map((w) => w.id));
		for (const [id] of WIDGET_REGISTRY) {
			if (!fromLayoutIds.has(id)) {
				const def = WIDGET_REGISTRY.get(
					id as HubWidgetId,
				) as HubWidgetDefinition;
				fromLayout.push({
					id,
					order: fromLayout.length,
					size: def.defaultSize,
					visible: false,
				});
			}
		}
		return fromLayout.sort((a, b) => a.order - b.order);
	}
	const p = profile === "custom" ? "full" : profile;
	return getWidgetsForProfile(p);
}

export function HubCustomizePanel({
	hubProfile,
	hubLayout,
}: HubCustomizePanelProps) {
	const fetcher = useFetcher<{ success?: boolean }>();
	const profile = hubProfile ?? "full";
	const isCustom = profile === "custom";
	const widgets = getEditableWidgets(profile, hubLayout);
	const isSubmitting = fetcher.state === "submitting";

	const handleProfileChange = (newProfile: HubProfile) => {
		const formData = new FormData();
		formData.set("intent", "update-hub-profile");
		formData.set("hubProfile", newProfile);
		fetcher.submit(formData, { method: "post", action: "/hub/settings" });
	};

	const handleLayoutUpdate = (newWidgets: HubWidgetLayout[]) => {
		const formData = new FormData();
		formData.set("intent", "update-hub-layout");
		formData.set("hubProfile", "custom");
		formData.set("hubLayout", JSON.stringify({ widgets: newWidgets }));
		fetcher.submit(formData, { method: "post", action: "/hub/settings" });
	};

	const toggleVisibility = (id: string) => {
		const next = widgets.map((w) =>
			w.id === id ? { ...w, visible: !w.visible } : w,
		);
		handleLayoutUpdate(next);
	};

	const moveWidget = (id: string, direction: "up" | "down") => {
		const idx = widgets.findIndex((w) => w.id === id);
		if (idx < 0) return;
		const swapIdx = direction === "up" ? idx - 1 : idx + 1;
		if (swapIdx < 0 || swapIdx >= widgets.length) return;
		const next = [...widgets];
		[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
		const reordered = next.map((w, i) => ({ ...w, order: i }));
		handleLayoutUpdate(reordered);
	};

	const setSize = (id: string, size: "sm" | "md" | "lg") => {
		const next = widgets.map((w) => (w.id === id ? { ...w, size } : w));
		handleLayoutUpdate(next);
	};

	return (
		<section className="glass-panel rounded-xl p-6">
			<h2 className="text-xl font-bold mb-2 text-carbon">Hub Layout</h2>
			<p className="text-sm text-muted mb-4">
				Choose a preset or customize which widgets appear on your Hub
			</p>

			{/* Profile selector */}
			<div className="mb-6">
				<span className="block text-sm font-medium text-carbon mb-2">
					Layout profile
				</span>
				<div className="flex flex-wrap gap-2">
					{(["full", "cook", "shop", "minimal", "custom"] as const).map((p) => (
						<button
							key={p}
							type="button"
							onClick={() => handleProfileChange(p)}
							disabled={isSubmitting}
							className={`px-4 py-2 rounded-lg font-medium transition-colors ${
								profile === p
									? "bg-hyper-green text-carbon"
									: "bg-platinum/50 text-carbon hover:bg-platinum"
							} disabled:opacity-50`}
						>
							{PROFILE_LABELS[p]}
						</button>
					))}
				</div>
			</div>

			{/* Widget list (custom mode or preview) */}
			<div className="space-y-3">
				<span className="block text-sm font-medium text-carbon">
					{isCustom ? "Widgets" : "Widgets (edit in Custom mode)"}
				</span>
				{widgets.map((w) => {
					const def = WIDGET_REGISTRY.get(w.id as HubWidgetId);
					if (!def) return null;
					const idx = widgets.findIndex((x) => x.id === w.id);
					return (
						<div
							key={w.id}
							className="flex items-center gap-4 p-3 bg-platinum/30 rounded-lg"
						>
							{/* Reorder */}
							{isCustom && (
								<div className="flex flex-col gap-0.5">
									<button
										type="button"
										onClick={() => moveWidget(w.id, "up")}
										disabled={idx <= 0 || isSubmitting}
										className="p-1 text-muted hover:text-carbon disabled:opacity-30"
										aria-label="Move up"
									>
										↑
									</button>
									<button
										type="button"
										onClick={() => moveWidget(w.id, "down")}
										disabled={idx >= widgets.length - 1 || isSubmitting}
										className="p-1 text-muted hover:text-carbon disabled:opacity-30"
										aria-label="Move down"
									>
										↓
									</button>
								</div>
							)}
							{/* Visibility toggle */}
							{isCustom && (
								<label className="flex items-center gap-2 cursor-pointer">
									<input
										type="checkbox"
										checked={w.visible}
										onChange={() => toggleVisibility(w.id)}
										disabled={isSubmitting}
										className="w-4 h-4 accent-hyper-green"
									/>
									<span className="text-sm text-carbon">Show</span>
								</label>
							)}
							{/* Widget info */}
							<div className="flex-1 min-w-0">
								<div className="font-medium text-carbon">{def.title}</div>
								<div className="text-xs text-muted truncate">
									{def.description}
								</div>
							</div>
							{/* Size */}
							{isCustom && (
								<div className="flex gap-1">
									{SIZE_OPTIONS.map((s) => (
										<button
											key={s}
											type="button"
											onClick={() => setSize(w.id, s)}
											disabled={isSubmitting}
											className={`px-2 py-1 text-xs rounded ${
												w.size === s
													? "bg-hyper-green text-carbon"
													: "bg-platinum/50 text-muted hover:bg-platinum"
											}`}
										>
											{s}
										</button>
									))}
								</div>
							)}
						</div>
					);
				})}
			</div>

			{/* Reset */}
			<div className="mt-6 pt-4 border-t border-carbon/10">
				<Form method="post" action="/hub/settings">
					<input type="hidden" name="intent" value="update-hub-profile" />
					<input type="hidden" name="hubProfile" value="full" />
					<button
						type="submit"
						disabled={isSubmitting}
						className="px-4 py-2 text-sm text-muted hover:text-carbon hover:bg-platinum/50 rounded-lg transition-colors disabled:opacity-50"
					>
						Reset to Full
					</button>
				</Form>
			</div>

			{isSubmitting && (
				<div className="mt-4 text-sm text-hyper-green animate-pulse">
					Saving...
				</div>
			)}
		</section>
	);
}
