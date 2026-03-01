import { useEffect, useState } from "react";
import { FilterSheet } from "./FilterSheet";

interface PageHeaderProps {
	/** Page icon (emoji or React node) */
	icon: React.ReactNode;
	/** Page title */
	title: string;
	/** Item count to display as badge */
	itemCount?: number;
	/** Whether to show search input */
	showSearch?: boolean;
	/** Search placeholder text */
	searchPlaceholder?: string;
	/** Search change handler */
	onSearchChange?: (query: string) => void;
	/** Filter controls to show in bottom sheet */
	filterContent?: React.ReactNode;
	/** Whether there are active filters */
	hasActiveFilters?: boolean;
	/** Callback when filter sheet is opened/closed */
	onFilterOpenChange?: (isOpen: boolean) => void;
	/** Override the default filter/action button icon */
	actionIcon?: React.ReactNode;
	/** Label for the action button (screen reader) */
	actionLabel?: string;
	/** Title shown in the mobile bottom sheet */
	sheetTitle?: string;
	/** When true, the filterContent only shows in the mobile sheet (never expands inline on desktop) */
	mobileOnly?: boolean;
	/** Extra content rendered between the title and the action button in the title row */
	titleRowExtra?: React.ReactNode;
	/** Small subtitle rendered below the title row (e.g. week date range on mobile) */
	subtitle?: React.ReactNode;
}

/**
 * PageHeader - A streamlined page header for Cargo, Galley, and Supply.
 * Shows icon + title inline with optional item count badge.
 * Search and filters are cleanly integrated.
 *
 * Part of Option B: Unified Control Bar UI redesign.
 */
export function PageHeader({
	icon,
	title,
	itemCount,
	showSearch = false,
	searchPlaceholder = "Search...",
	onSearchChange,
	filterContent,
	hasActiveFilters = false,
	onFilterOpenChange,
	actionIcon,
	actionLabel,
	sheetTitle = "Filters",
	mobileOnly = false,
	titleRowExtra,
	subtitle,
}: PageHeaderProps) {
	const [isFilterOpen, setIsFilterOpen] = useState(false);
	const [isDesktop, setIsDesktop] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	useEffect(() => {
		const mediaQuery = window.matchMedia("(min-width: 768px)");
		setIsDesktop(mediaQuery.matches);
		const handleChange = (event: MediaQueryListEvent) => {
			setIsDesktop(event.matches);
		};
		mediaQuery.addEventListener("change", handleChange);
		return () => mediaQuery.removeEventListener("change", handleChange);
	}, []);

	const handleFilterOpenChange = (open: boolean) => {
		setIsFilterOpen(open);
		onFilterOpenChange?.(open);
	};

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setSearchQuery(e.target.value);
		onSearchChange?.(e.target.value);
	};

	return (
		<>
			<header className="mb-4">
				{/* Title row */}
				<div className="flex items-center justify-between mb-3">
					<div className="flex items-center gap-2 flex-1 min-w-0">
						<span className="text-2xl shrink-0">{icon}</span>
						<h1 className="text-2xl font-bold text-carbon dark:text-white shrink-0">
							{title}
						</h1>
						{itemCount !== undefined && (
							<span className="text-sm font-medium text-muted bg-platinum dark:bg-white/10 px-2 py-0.5 rounded-full shrink-0">
								{itemCount}
							</span>
						)}
						{/* Optional extra content inline with title (e.g. week navigator on mobile) */}
						{titleRowExtra && (
							<div className="flex-1 min-w-0 flex justify-end">
								{titleRowExtra}
							</div>
						)}
					</div>

					{/* Action/filter button (if filterContent provided) */}
					{filterContent && (
						<button
							type="button"
							onClick={() => handleFilterOpenChange(!isFilterOpen)}
							aria-label={
								actionLabel ??
								(hasActiveFilters ? "Filters active" : "More options")
							}
							className={`
						ml-2 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all shrink-0
						${
							hasActiveFilters
								? "bg-hyper-green/10 text-hyper-green border border-hyper-green"
								: "bg-platinum dark:bg-white/10 text-carbon dark:text-white/80"
						}
					`}
						>
							{actionIcon ?? <FilterIcon />}
							{hasActiveFilters && (
								<span className="sr-only">Filters active</span>
							)}
						</button>
					)}
				</div>

				{/* Subtitle row (e.g. compact date range on mobile) */}
				{subtitle && <div className="mb-2 -mt-1">{subtitle}</div>}

				{/* Search row */}
				{showSearch && (
					<div className="relative">
						<SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
						<input
							type="text"
							placeholder={searchPlaceholder}
							value={searchQuery}
							onChange={handleSearchChange}
							className="w-full bg-platinum/50 dark:bg-white/5 border border-platinum dark:border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-carbon dark:text-white placeholder:text-muted focus:border-hyper-green focus:ring-1 focus:ring-hyper-green outline-none transition-all"
						/>
					</div>
				)}

				{/* Desktop filters inline (suppressed when mobileOnly) */}
				{filterContent && !mobileOnly && (
					<div
						className={`
						hidden md:block mt-4 overflow-hidden transition-[max-height,opacity] duration-200 ease-out
						${isFilterOpen ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"}
					`}
					>
						{filterContent}
					</div>
				)}
			</header>

			{/* Mobile filter/options sheet */}
			{filterContent && (
				<FilterSheet
					isOpen={isFilterOpen && !isDesktop}
					onClose={() => handleFilterOpenChange(false)}
					title={sheetTitle}
				>
					{filterContent}
				</FilterSheet>
			)}
		</>
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
				d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
			/>
		</svg>
	);
}

function SearchIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
			/>
		</svg>
	);
}
