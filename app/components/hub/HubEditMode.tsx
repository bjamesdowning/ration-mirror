import { useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import {
	type HubWidgetId,
	PROFILE_PRESETS,
	WIDGET_REGISTRY,
} from "~/components/hub/widgets/registry";
import type {
	HubLoaderData,
	HubProfile,
	HubWidgetFilters,
	HubWidgetLayout,
} from "~/lib/types";

// Widgets that support tag filtering (OR logic)
const TAG_FILTER_WIDGETS: HubWidgetId[] = [
	"meals-ready",
	"meals-partial",
	"snacks-ready",
	"manifest-preview",
];

// Widgets that support a limit override
const LIMIT_FILTER_WIDGETS: HubWidgetId[] = [
	"meals-ready",
	"meals-partial",
	"snacks-ready",
	"cargo-expiring",
	"supply-preview",
];

// Widgets that support slot-type filtering
const SLOT_FILTER_WIDGETS: HubWidgetId[] = ["manifest-preview"];

// Widgets that support domain filtering
const DOMAIN_FILTER_WIDGETS: HubWidgetId[] = ["cargo-expiring"];

const SLOT_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
const CARGO_DOMAINS = ["food", "household", "alcohol"] as const;

interface HubEditModeProps {
	hubProfile?: HubProfile;
	hubLayout?: { widgets: HubWidgetLayout[] };
	data: HubLoaderData;
	availableMealTags: string[];
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

// ---------------------------------------------------------------------------
// Widget filter panel
// ---------------------------------------------------------------------------

interface WidgetFilterPanelProps {
	widgetId: HubWidgetId;
	filters: HubWidgetFilters | undefined;
	availableMealTags: string[];
	isSaving: boolean;
	onChange: (filters: HubWidgetFilters) => void;
}

function WidgetFilterPanel({
	widgetId,
	filters,
	availableMealTags,
	isSaving,
	onChange,
}: WidgetFilterPanelProps) {
	const supportsTags = TAG_FILTER_WIDGETS.includes(widgetId);
	const supportsSlot = SLOT_FILTER_WIDGETS.includes(widgetId);
	const supportsDomain = DOMAIN_FILTER_WIDGETS.includes(widgetId);
	const supportsLimit = LIMIT_FILTER_WIDGETS.includes(widgetId);
	const hasAnyFilter =
		supportsTags || supportsSlot || supportsDomain || supportsLimit;

	if (!hasAnyFilter) return null;

	const currentTags = filters?.tags ?? [];
	const currentSlot = filters?.slotType;
	const currentDomain = filters?.domain;
	const currentLimit = filters?.limit;

	const update = (patch: Partial<HubWidgetFilters>) => {
		onChange({ ...filters, ...patch });
	};

	const toggleTag = (tag: string) => {
		const next = currentTags.includes(tag)
			? currentTags.filter((t) => t !== tag)
			: [...currentTags, tag].slice(0, 5);
		update({ tags: next.length ? next : undefined });
	};

	return (
		<div className="mt-2 px-3 py-3 bg-[#1a1a1a] rounded-lg border border-white/10 space-y-3">
			{/* Tag filter */}
			{supportsTags && availableMealTags.length > 0 && (
				<div>
					<p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1.5">
						Filter by Tag
						{currentTags.length > 0 && (
							<span className="ml-1.5 text-hyper-green">
								({currentTags.length})
							</span>
						)}
					</p>
					<div className="flex flex-wrap gap-1.5">
						{availableMealTags.map((tag) => {
							const active = currentTags.includes(tag);
							return (
								<button
									key={tag}
									type="button"
									disabled={isSaving}
									onClick={() => toggleTag(tag)}
									className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors capitalize ${
										active
											? "bg-hyper-green text-carbon"
											: "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
									}`}
								>
									{tag}
								</button>
							);
						})}
					</div>
					{currentTags.length > 0 && (
						<button
							type="button"
							disabled={isSaving}
							onClick={() => update({ tags: undefined })}
							className="mt-1.5 text-[10px] text-white/40 hover:text-white/70 transition-colors"
						>
							Clear tags
						</button>
					)}
				</div>
			)}

			{/* Slot type filter */}
			{supportsSlot && (
				<div>
					<p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1.5">
						Slot
					</p>
					<div className="flex gap-1.5 flex-wrap">
						<button
							type="button"
							disabled={isSaving}
							onClick={() => update({ slotType: undefined })}
							className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
								!currentSlot
									? "bg-hyper-green text-carbon"
									: "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
							}`}
						>
							All
						</button>
						{SLOT_TYPES.map((slot) => (
							<button
								key={slot}
								type="button"
								disabled={isSaving}
								onClick={() =>
									update({ slotType: currentSlot === slot ? undefined : slot })
								}
								className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize transition-colors ${
									currentSlot === slot
										? "bg-hyper-green text-carbon"
										: "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
								}`}
							>
								{slot}
							</button>
						))}
					</div>
				</div>
			)}

			{/* Domain filter */}
			{supportsDomain && (
				<div>
					<p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1.5">
						Domain
					</p>
					<div className="flex gap-1.5 flex-wrap">
						<button
							type="button"
							disabled={isSaving}
							onClick={() => update({ domain: undefined })}
							className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
								!currentDomain
									? "bg-hyper-green text-carbon"
									: "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
							}`}
						>
							All
						</button>
						{CARGO_DOMAINS.map((d) => (
							<button
								key={d}
								type="button"
								disabled={isSaving}
								onClick={() =>
									update({ domain: currentDomain === d ? undefined : d })
								}
								className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize transition-colors ${
									currentDomain === d
										? "bg-hyper-green text-carbon"
										: "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
								}`}
							>
								{d}
							</button>
						))}
					</div>
				</div>
			)}

			{/* Limit override */}
			{supportsLimit && (
				<div>
					<p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1.5">
						Show up to
					</p>
					<div className="flex items-center gap-2">
						<button
							type="button"
							disabled={isSaving || (currentLimit ?? 6) <= 1}
							onClick={() =>
								update({
									limit:
										currentLimit !== undefined
											? Math.max(1, currentLimit - 1)
											: undefined,
								})
							}
							className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xs font-bold disabled:opacity-30 transition-colors"
						>
							−
						</button>
						<span className="text-sm font-bold text-white min-w-[2ch] text-center">
							{currentLimit ?? "—"}
						</span>
						<button
							type="button"
							disabled={isSaving || (currentLimit ?? 20) >= 20}
							onClick={() =>
								update({ limit: Math.min(20, (currentLimit ?? 6) + 1) })
							}
							className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xs font-bold disabled:opacity-30 transition-colors"
						>
							+
						</button>
						{currentLimit !== undefined && (
							<button
								type="button"
								disabled={isSaving}
								onClick={() => update({ limit: undefined })}
								className="text-[10px] text-white/40 hover:text-white/70 transition-colors ml-1"
							>
								Reset
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// HubEditMode
// ---------------------------------------------------------------------------

export function HubEditMode({
	hubProfile,
	hubLayout,
	data,
	availableMealTags,
	onExit,
}: HubEditModeProps) {
	const [widgets, setWidgets] = useState(() =>
		initEditableWidgets(hubProfile, hubLayout),
	);
	const [expandedFilterId, setExpandedFilterId] = useState<string | null>(null);
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

	const updateFilters = (id: string, filters: HubWidgetFilters) => {
		// Prune keys that are undefined so storage stays compact
		const cleaned: HubWidgetFilters = Object.fromEntries(
			Object.entries(filters).filter(([, v]) => v !== undefined),
		) as HubWidgetFilters;
		const hasAny = Object.keys(cleaned).length > 0;
		const next = widgets.map((w) =>
			w.id === id ? { ...w, filters: hasAny ? cleaned : undefined } : w,
		);
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
						Toggle, resize, reorder, and filter. Changes save automatically.
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
					const widgetId = w.id as HubWidgetId;
					const supportsFilter =
						TAG_FILTER_WIDGETS.includes(widgetId) ||
						SLOT_FILTER_WIDGETS.includes(widgetId) ||
						DOMAIN_FILTER_WIDGETS.includes(widgetId) ||
						LIMIT_FILTER_WIDGETS.includes(widgetId);
					const filterOpen = expandedFilterId === w.id;
					const hasActiveFilters =
						w.filters &&
						Object.values(w.filters).some(
							(v) => v !== undefined && !(Array.isArray(v) && v.length === 0),
						);

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

									{/* Size selector + filter toggle + visibility toggle */}
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

										{/* Filter toggle (only shown for filterable widgets) */}
										{supportsFilter && (
											<button
												type="button"
												onClick={() =>
													setExpandedFilterId(filterOpen ? null : w.id)
												}
												disabled={isSaving}
												className={`p-1 rounded transition-colors relative ${
													filterOpen
														? "text-hyper-green"
														: hasActiveFilters
															? "text-hyper-green/70 hover:text-hyper-green"
															: "text-white/30 hover:text-white/60"
												}`}
												aria-label={
													filterOpen ? "Close filters" : "Open filters"
												}
												aria-expanded={filterOpen}
											>
												<FilterIcon />
												{hasActiveFilters && !filterOpen && (
													<span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-hyper-green" />
												)}
											</button>
										)}

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

								{/* Filter panel — inline collapsible */}
								{supportsFilter && filterOpen && (
									<WidgetFilterPanel
										widgetId={widgetId}
										filters={w.filters}
										availableMealTags={availableMealTags}
										isSaving={isSaving}
										onChange={(filters) => updateFilters(w.id, filters)}
									/>
								)}

								{/* The actual widget rendered live */}
								<div className={filterOpen ? "mt-2" : ""}>
									<WidgetComponent data={data} size={size} />
								</div>
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

function FilterIcon() {
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
				d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
			/>
		</svg>
	);
}
