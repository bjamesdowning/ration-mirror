import { useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import {
	type HubWidgetId,
	PROFILE_PRESETS,
	WIDGET_REGISTRY,
} from "~/components/hub/widgets/registry";
import type { HubLoaderData, HubProfile, HubWidgetLayout } from "~/lib/types";

interface HubEditModeProps {
	hubProfile?: HubProfile;
	hubLayout?: { widgets: HubWidgetLayout[] };
	data: HubLoaderData;
	onExit: () => void;
}

function getColSpanClass(size: "sm" | "md" | "lg"): string {
	switch (size) {
		case "sm":
			return "md:col-span-4";
		case "md":
			return "md:col-span-6";
		case "lg":
			return "md:col-span-12";
		default:
			return "md:col-span-6";
	}
}

function initEditableWidgets(
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

	// Ensure all registered widgets are present; add missing ones as hidden
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

export function HubEditMode({
	hubProfile,
	hubLayout,
	data,
	onExit,
}: HubEditModeProps) {
	const [widgets, setWidgets] = useState(() =>
		initEditableWidgets(hubProfile, hubLayout),
	);
	const fetcher = useFetcher<{ success?: boolean }>();
	const revalidator = useRevalidator();
	const prevFetcherState = useRef(fetcher.state);
	const isSaving = fetcher.state !== "idle";

	// Revalidate hub loader when layout save completes so LayoutEngine shows fresh data on Done
	useEffect(() => {
		if (prevFetcherState.current === "submitting" && fetcher.state === "idle") {
			revalidator.revalidate();
		}
		prevFetcherState.current = fetcher.state;
	}, [fetcher.state, revalidator]);

	const save = (next: HubWidgetLayout[]) => {
		const formData = new FormData();
		formData.set("intent", "update-hub-layout");
		formData.set("hubLayout", JSON.stringify({ widgets: next }));
		fetcher.submit(formData, { method: "post", action: "/hub/settings" });
	};

	const toggleVisibility = (id: string) => {
		const next = widgets.map((w) =>
			w.id === id ? { ...w, visible: !w.visible } : w,
		);
		setWidgets(next);
		save(next);
	};

	const moveWidget = (id: string, direction: "up" | "down") => {
		const idx = widgets.findIndex((w) => w.id === id);
		if (idx < 0) return;
		const swapIdx = direction === "up" ? idx - 1 : idx + 1;
		if (swapIdx < 0 || swapIdx >= widgets.length) return;
		const next = [...widgets];
		[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
		const reordered = next.map((w, i) => ({ ...w, order: i }));
		setWidgets(reordered);
		save(reordered);
	};

	const setSize = (id: string, size: "sm" | "md" | "lg") => {
		const next = widgets.map((w) => (w.id === id ? { ...w, size } : w));
		setWidgets(next);
		save(next);
	};

	return (
		<div>
			{/* Edit mode banner */}
			<div className="flex items-center justify-between mb-6 px-4 py-3 bg-[#111111] rounded-xl">
				<div>
					<p className="font-semibold text-white text-sm">Editing Hub Layout</p>
					<p className="text-xs text-white/60">
						Toggle, resize, and reorder. Changes save automatically.
					</p>
				</div>
				<div className="flex items-center gap-3">
					{isSaving && (
						<span className="text-xs text-hyper-green animate-pulse">
							Saving…
						</span>
					)}
					<button
						type="button"
						onClick={onExit}
						className="px-4 py-2 bg-hyper-green text-carbon font-semibold rounded-lg text-sm hover:bg-hyper-green/90 transition-colors"
					>
						Done
					</button>
				</div>
			</div>

			{/* Widget grid — all widgets shown (hidden ones are muted) */}
			<div className="grid grid-cols-1 md:grid-cols-12 gap-6">
				{widgets.map((w, idx) => {
					const def = WIDGET_REGISTRY.get(w.id as HubWidgetId);
					if (!def) return null;
					const WidgetComponent = def.component;
					const size = (w.size ?? def.defaultSize) as "sm" | "md" | "lg";
					const isHidden = !w.visible;

					return (
						<div key={w.id} className={getColSpanClass(size)}>
							<div
								className={`transition-opacity duration-150 ${
									isHidden ? "opacity-40" : "opacity-100"
								}`}
							>
								{/* Per-widget control bar */}
								<div className="flex items-center justify-between px-2 py-1.5 mb-2 bg-[#111111] rounded-lg gap-2">
									{/* Reorder arrows */}
									<div className="flex items-center gap-0.5 shrink-0">
										<button
											type="button"
											onClick={() => moveWidget(w.id, "up")}
											disabled={idx <= 0 || isSaving}
											className="p-1 rounded text-white/60 hover:text-white disabled:opacity-20 transition-colors"
											aria-label="Move up"
										>
											<ChevronUpIcon />
										</button>
										<button
											type="button"
											onClick={() => moveWidget(w.id, "down")}
											disabled={idx >= widgets.length - 1 || isSaving}
											className="p-1 rounded text-white/60 hover:text-white disabled:opacity-20 transition-colors"
											aria-label="Move down"
										>
											<ChevronDownIcon />
										</button>
									</div>

									{/* Widget title */}
									<span className="flex-1 text-xs font-bold uppercase tracking-widest text-white/80 text-center truncate px-1">
										{def.title}
									</span>

									{/* Size selector + visibility toggle */}
									<div className="flex items-center gap-1.5 shrink-0">
										<div className="flex gap-0.5">
											{(["sm", "md", "lg"] as const).map((s) => (
												<button
													key={s}
													type="button"
													onClick={() => setSize(w.id, s)}
													disabled={isSaving}
													className={`px-1.5 py-0.5 text-xs rounded font-bold transition-colors ${
														size === s
															? "bg-hyper-green text-carbon"
															: "text-white/40 hover:text-white"
													}`}
												>
													{s.toUpperCase()}
												</button>
											))}
										</div>

										<button
											type="button"
											onClick={() => toggleVisibility(w.id)}
											disabled={isSaving}
											className={`p-1 rounded transition-colors ${
												w.visible
													? "text-hyper-green hover:text-hyper-green/70"
													: "text-white/30 hover:text-white/60"
											}`}
											aria-label={w.visible ? "Hide widget" : "Show widget"}
										>
											{w.visible ? <EyeIcon /> : <EyeOffIcon />}
										</button>
									</div>
								</div>

								{/* The actual widget rendered live */}
								<WidgetComponent data={data} size={size} />
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function ChevronUpIcon() {
	return (
		<svg
			className="w-3 h-3"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2.5}
				d="M5 15l7-7 7 7"
			/>
		</svg>
	);
}

function ChevronDownIcon() {
	return (
		<svg
			className="w-3 h-3"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2.5}
				d="M19 9l-7 7-7-7"
			/>
		</svg>
	);
}

function EyeIcon() {
	return (
		<svg
			className="w-4 h-4"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
			/>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
			/>
		</svg>
	);
}

function EyeOffIcon() {
	return (
		<svg
			className="w-4 h-4"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21"
			/>
		</svg>
	);
}
