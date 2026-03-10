import { useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator, useRouteLoaderData } from "react-router";
import {
	createHubLayoutFormData,
	hasActiveWidgetFilters,
	initEditableWidgets,
	moveWidget,
	setWidgetFilters,
	setWidgetSize,
	toggleWidgetVisibility,
} from "~/components/hub/hubEditUtils";
import {
	supportsWidgetFilters,
	WidgetFilterPanel,
} from "~/components/hub/WidgetFilterPanel";
import {
	type HubWidgetId,
	WIDGET_REGISTRY,
} from "~/components/hub/widgets/registry";
import type {
	HubLoaderData,
	HubProfile,
	HubWidgetFilters,
	HubWidgetLayout,
} from "~/lib/types";

interface HubEditModeMobileProps {
	hubProfile?: HubProfile;
	hubLayout?: { widgets: HubWidgetLayout[] };
	data: HubLoaderData;
	availableMealTags: string[];
	onExit: () => void;
}

export function HubEditModeMobile({
	hubProfile,
	hubLayout,
	availableMealTags,
	onExit,
}: HubEditModeMobileProps) {
	const [widgets, setWidgets] = useState(() =>
		initEditableWidgets(hubProfile, hubLayout),
	);
	const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null);
	const sheetRef = useRef<HTMLDivElement>(null);
	const prevFocusRef = useRef<HTMLElement | null>(null);
	const fetcher = useFetcher<{ success?: boolean }>();
	const rootData = useRouteLoaderData("root") as
		| { theme?: "light" | "dark" }
		| undefined;
	const appTheme = rootData?.theme ?? "dark";
	const revalidator = useRevalidator();
	const prevFetcherState = useRef(fetcher.state);
	const isSaving = fetcher.state !== "idle";

	useEffect(() => {
		if (prevFetcherState.current === "submitting" && fetcher.state === "idle") {
			revalidator.revalidate();
		}
		prevFetcherState.current = fetcher.state;
	}, [fetcher.state, revalidator]);

	useEffect(() => {
		if (!activeWidgetId) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setActiveWidgetId(null);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [activeWidgetId]);

	// Focus trap and restore for the widget settings bottom sheet
	useEffect(() => {
		if (!activeWidgetId || !sheetRef.current) return;
		prevFocusRef.current = document.activeElement as HTMLElement | null;
		const sheet = sheetRef.current;
		const focusable = sheet.querySelectorAll<HTMLElement>(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
		);
		const first = focusable[0];
		if (first) first.focus();

		const trap = (e: KeyboardEvent) => {
			if (e.key !== "Tab") return;
			if (focusable.length === 0) return;
			const last = focusable[focusable.length - 1];
			if (e.shiftKey) {
				if (document.activeElement === first) {
					e.preventDefault();
					last?.focus();
				}
			} else {
				if (document.activeElement === last) {
					e.preventDefault();
					first?.focus();
				}
			}
		};
		sheet.addEventListener("keydown", trap);
		return () => {
			sheet.removeEventListener("keydown", trap);
			prevFocusRef.current?.focus();
		};
	}, [activeWidgetId]);

	const save = (next: HubWidgetLayout[]) => {
		fetcher.submit(createHubLayoutFormData(next), {
			method: "post",
			action: "/hub/settings",
		});
	};

	const handleToggleVisibility = (id: string) => {
		const next = toggleWidgetVisibility(widgets, id);
		setWidgets(next);
		save(next);
	};

	const handleMove = (id: string, direction: "up" | "down") => {
		const next = moveWidget(widgets, id, direction);
		setWidgets(next);
		save(next);
	};

	const handleSize = (id: string, size: "sm" | "md" | "lg") => {
		const next = setWidgetSize(widgets, id, size);
		setWidgets(next);
		save(next);
	};

	const handleFilters = (id: string, filters: HubWidgetFilters) => {
		const next = setWidgetFilters(widgets, id, filters);
		setWidgets(next);
		save(next);
	};

	const activeWidget =
		activeWidgetId !== null
			? widgets.find((widget) => widget.id === activeWidgetId)
			: null;
	const activeWidgetDef = activeWidget
		? WIDGET_REGISTRY.get(activeWidget.id as HubWidgetId)
		: undefined;
	const activeWidgetIdTyped = activeWidget?.id as HubWidgetId | undefined;
	const activeWidgetSize =
		activeWidget && activeWidgetDef
			? (activeWidget.size ?? activeWidgetDef.defaultSize)
			: "md";

	return (
		<div>
			<div className="flex items-start justify-between mb-4 px-4 py-3 bg-[#111111] rounded-xl gap-3">
				<div>
					<p className="font-semibold text-white text-sm">Editing Hub Layout</p>
					<p className="text-xs text-white/60">
						Reorder widgets, open one to resize/filter, and toggle visibility.
					</p>
				</div>
				<div className="flex items-center gap-3 shrink-0">
					{isSaving && (
						<span className="text-xs text-hyper-green animate-pulse">
							Saving…
						</span>
					)}
					<button
						type="button"
						onClick={onExit}
						className="px-4 min-h-[44px] bg-hyper-green text-carbon font-semibold rounded-lg text-sm hover:bg-hyper-green/90 transition-colors"
					>
						Done
					</button>
				</div>
			</div>

			<div className="space-y-2">
				{widgets.map((widget, index) => {
					const def = WIDGET_REGISTRY.get(widget.id as HubWidgetId);
					if (!def) return null;

					const size = (widget.size ?? def.defaultSize) as "sm" | "md" | "lg";
					const filterCount = hasActiveWidgetFilters(widget.filters)
						? Object.values(widget.filters ?? {}).filter(
								(value) =>
									value !== undefined &&
									!(Array.isArray(value) && value.length === 0),
							).length
						: 0;

					return (
						<div
							key={widget.id}
							className={`rounded-xl border border-platinum dark:border-white/10 bg-ceramic/70 dark:bg-white/5 transition-opacity ${
								widget.visible ? "opacity-100" : "opacity-50"
							}`}
						>
							<div className="flex items-center gap-1 p-2">
								<div className="flex flex-col shrink-0">
									<button
										type="button"
										onClick={() => handleMove(widget.id, "up")}
										disabled={index <= 0 || isSaving}
										className="min-w-[44px] min-h-[44px] rounded-lg text-muted hover:text-carbon dark:hover:text-white hover:bg-platinum dark:hover:bg-white/10 disabled:opacity-30 transition-colors flex items-center justify-center"
										aria-label={`Move ${def.title} up`}
									>
										<ChevronUpIcon />
									</button>
									<button
										type="button"
										onClick={() => handleMove(widget.id, "down")}
										disabled={index >= widgets.length - 1 || isSaving}
										className="min-w-[44px] min-h-[44px] rounded-lg text-muted hover:text-carbon dark:hover:text-white hover:bg-platinum dark:hover:bg-white/10 disabled:opacity-30 transition-colors flex items-center justify-center"
										aria-label={`Move ${def.title} down`}
									>
										<ChevronDownIcon />
									</button>
								</div>

								<button
									type="button"
									onClick={() => setActiveWidgetId(widget.id)}
									disabled={isSaving}
									className="flex-1 text-left min-h-[44px] rounded-lg px-3 py-2 hover:bg-platinum dark:hover:bg-white/10 transition-colors disabled:opacity-60"
								>
									<p className="text-sm font-semibold text-carbon dark:text-white">
										{def.title}
									</p>
									<p className="text-xs text-muted mt-0.5 line-clamp-2">
										{def.description}
									</p>
									<p className="text-[11px] text-muted mt-1">
										Size: {size.toUpperCase()}
										{supportsWidgetFilters(widget.id as HubWidgetId) &&
											filterCount > 0 &&
											` • ${filterCount} filter(s) active`}
									</p>
								</button>

								<button
									type="button"
									onClick={() => handleToggleVisibility(widget.id)}
									disabled={isSaving}
									className={`min-w-[44px] min-h-[44px] rounded-lg transition-colors flex items-center justify-center ${
										widget.visible
											? "text-hyper-green hover:bg-hyper-green/10"
											: "text-muted hover:text-carbon dark:hover:text-white hover:bg-platinum dark:hover:bg-white/10"
									}`}
									aria-label={widget.visible ? "Hide widget" : "Show widget"}
								>
									{widget.visible ? <EyeIcon /> : <EyeOffIcon />}
								</button>
							</div>
						</div>
					);
				})}
			</div>

			{activeWidget && activeWidgetDef && activeWidgetIdTyped && (
				<div className="fixed inset-0 bg-carbon/30 backdrop-blur-sm flex items-end z-[80] md:hidden">
					<button
						type="button"
						className="absolute inset-0 w-full h-full"
						onClick={() => setActiveWidgetId(null)}
						aria-label="Close widget settings"
					/>
					<div
						ref={sheetRef}
						role="dialog"
						aria-modal="true"
						aria-labelledby="widget-sheet-title"
						className="bg-ceramic dark:bg-[#1A1A1A] rounded-t-2xl p-6 w-full relative max-h-[90vh] overflow-y-auto safe-area-pb"
					>
						<button
							type="button"
							onClick={() => setActiveWidgetId(null)}
							className="absolute top-4 right-4 min-w-[44px] min-h-[44px] rounded-lg text-muted hover:text-carbon dark:hover:text-white hover:bg-platinum dark:hover:bg-white/10 transition-colors flex items-center justify-center"
							aria-label="Close widget settings"
						>
							<CloseIcon />
						</button>

						<h2
							id="widget-sheet-title"
							className="text-lg font-bold text-carbon dark:text-white pr-12"
						>
							{activeWidgetDef.title}
						</h2>
						<p className="text-sm text-muted mt-1">
							{activeWidgetDef.description}
						</p>

						<div className="mt-5">
							<p className="text-xs font-bold uppercase tracking-widest text-muted mb-2">
								Size
							</p>
							<div className="grid grid-cols-3 gap-2">
								{(["sm", "md", "lg"] as const).map((size) => (
									<button
										key={size}
										type="button"
										onClick={() => handleSize(activeWidget.id, size)}
										disabled={isSaving}
										className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
											activeWidgetSize === size
												? "bg-hyper-green text-carbon"
												: "bg-platinum dark:bg-white/10 text-carbon dark:text-white hover:bg-platinum/80 dark:hover:bg-white/20"
										}`}
									>
										{size.toUpperCase()}
									</button>
								))}
							</div>
						</div>

						{supportsWidgetFilters(activeWidgetIdTyped) && (
							<div className="mt-5">
								<p className="text-xs font-bold uppercase tracking-widest text-muted mb-2">
									Filters
								</p>
								<WidgetFilterPanel
									widgetId={activeWidgetIdTyped}
									filters={activeWidget.filters}
									availableMealTags={availableMealTags}
									isSaving={isSaving}
									onChange={(filters) =>
										handleFilters(activeWidget.id, filters)
									}
									touchFriendly
									theme={appTheme}
								/>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function ChevronUpIcon() {
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
				strokeWidth={2.5}
				d="M5 15l7-7 7 7"
			/>
		</svg>
	);
}

function ChevronDownIcon() {
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
				strokeWidth={2.5}
				d="M19 9l-7 7-7-7"
			/>
		</svg>
	);
}

function EyeIcon() {
	return (
		<svg
			className="w-5 h-5"
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
			className="w-5 h-5"
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

function CloseIcon() {
	return (
		<svg
			className="w-5 h-5"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M6 18L18 6M6 6l12 12"
			/>
		</svg>
	);
}
