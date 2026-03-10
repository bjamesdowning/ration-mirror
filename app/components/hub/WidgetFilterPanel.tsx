import type { HubWidgetId } from "~/components/hub/widgets/registry";
import type { HubWidgetFilters } from "~/lib/types";

export const TAG_FILTER_WIDGETS: HubWidgetId[] = [
	"meals-ready",
	"meals-partial",
	"snacks-ready",
	"manifest-preview",
];

export const LIMIT_FILTER_WIDGETS: HubWidgetId[] = [
	"meals-ready",
	"meals-partial",
	"snacks-ready",
	"cargo-expiring",
	"supply-preview",
];

export const SLOT_FILTER_WIDGETS: HubWidgetId[] = ["manifest-preview"];

export const DOMAIN_FILTER_WIDGETS: HubWidgetId[] = ["cargo-expiring"];

const SLOT_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
const CARGO_DOMAINS = ["food", "household", "alcohol"] as const;

interface WidgetFilterPanelProps {
	widgetId: HubWidgetId;
	filters: HubWidgetFilters | undefined;
	availableMealTags: string[];
	isSaving: boolean;
	onChange: (filters: HubWidgetFilters) => void;
	touchFriendly?: boolean;
	theme?: "dark" | "light";
}

export function supportsWidgetFilters(widgetId: HubWidgetId): boolean {
	return (
		TAG_FILTER_WIDGETS.includes(widgetId) ||
		SLOT_FILTER_WIDGETS.includes(widgetId) ||
		DOMAIN_FILTER_WIDGETS.includes(widgetId) ||
		LIMIT_FILTER_WIDGETS.includes(widgetId)
	);
}

export function WidgetFilterPanel({
	widgetId,
	filters,
	availableMealTags,
	isSaving,
	onChange,
	touchFriendly = false,
	theme = "dark",
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

	const containerClass =
		theme === "dark"
			? "mt-2 px-3 py-3 bg-[#1a1a1a] rounded-lg border border-white/10 space-y-3"
			: "mt-2 px-3 py-3 bg-platinum/50 dark:bg-white/5 rounded-lg border border-platinum dark:border-white/10 space-y-3";

	const labelClass =
		theme === "dark"
			? "text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1.5"
			: "text-[10px] font-bold uppercase tracking-widest text-muted mb-1.5";

	const inactiveChipClass =
		theme === "dark"
			? "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
			: "bg-white/70 dark:bg-white/10 text-muted dark:text-white/70 hover:bg-platinum dark:hover:bg-white/20 hover:text-carbon dark:hover:text-white";

	const chipSizeClass = touchFriendly
		? "min-h-[44px] px-3 py-2 text-sm"
		: "px-2 py-0.5 text-[11px]";

	const clearClass =
		theme === "dark"
			? "text-[10px] text-white/40 hover:text-white/70"
			: "text-[11px] text-muted hover:text-carbon dark:hover:text-white";
	const limitTextClass =
		theme === "dark" ? "text-white" : "text-carbon dark:text-white";

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
		<div className={containerClass}>
			{supportsTags && availableMealTags.length > 0 && (
				<div>
					<p className={labelClass}>
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
									className={`${chipSizeClass} rounded-full font-medium transition-colors capitalize ${
										active ? "bg-hyper-green text-carbon" : inactiveChipClass
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
							className={`mt-1.5 transition-colors ${clearClass}`}
						>
							Clear tags
						</button>
					)}
				</div>
			)}

			{supportsSlot && (
				<div>
					<p className={labelClass}>Slot</p>
					<div className="flex gap-1.5 flex-wrap">
						<button
							type="button"
							disabled={isSaving}
							onClick={() => update({ slotType: undefined })}
							className={`${chipSizeClass} rounded-full font-medium transition-colors ${
								!currentSlot ? "bg-hyper-green text-carbon" : inactiveChipClass
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
								className={`${chipSizeClass} rounded-full font-medium capitalize transition-colors ${
									currentSlot === slot
										? "bg-hyper-green text-carbon"
										: inactiveChipClass
								}`}
							>
								{slot}
							</button>
						))}
					</div>
				</div>
			)}

			{supportsDomain && (
				<div>
					<p className={labelClass}>Domain</p>
					<div className="flex gap-1.5 flex-wrap">
						<button
							type="button"
							disabled={isSaving}
							onClick={() => update({ domain: undefined })}
							className={`${chipSizeClass} rounded-full font-medium transition-colors ${
								!currentDomain
									? "bg-hyper-green text-carbon"
									: inactiveChipClass
							}`}
						>
							All
						</button>
						{CARGO_DOMAINS.map((domain) => (
							<button
								key={domain}
								type="button"
								disabled={isSaving}
								onClick={() =>
									update({
										domain: currentDomain === domain ? undefined : domain,
									})
								}
								className={`${chipSizeClass} rounded-full font-medium capitalize transition-colors ${
									currentDomain === domain
										? "bg-hyper-green text-carbon"
										: inactiveChipClass
								}`}
							>
								{domain}
							</button>
						))}
					</div>
				</div>
			)}

			{supportsLimit && (
				<div>
					<p className={labelClass}>Show up to</p>
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
							className={`rounded bg-white/10 dark:bg-white/10 hover:bg-white/20 ${limitTextClass} flex items-center justify-center text-sm font-bold disabled:opacity-30 transition-colors ${
								touchFriendly ? "w-10 h-10" : "w-6 h-6"
							}`}
						>
							−
						</button>
						<span
							className={`text-sm font-bold min-w-[2ch] text-center ${limitTextClass}`}
						>
							{currentLimit ?? "—"}
						</span>
						<button
							type="button"
							disabled={isSaving || (currentLimit ?? 20) >= 20}
							onClick={() =>
								update({ limit: Math.min(20, (currentLimit ?? 6) + 1) })
							}
							className={`rounded bg-white/10 dark:bg-white/10 hover:bg-white/20 ${limitTextClass} flex items-center justify-center text-sm font-bold disabled:opacity-30 transition-colors ${
								touchFriendly ? "w-10 h-10" : "w-6 h-6"
							}`}
						>
							+
						</button>
						{currentLimit !== undefined && (
							<button
								type="button"
								disabled={isSaving}
								onClick={() => update({ limit: undefined })}
								className={`ml-1 transition-colors ${clearClass}`}
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
