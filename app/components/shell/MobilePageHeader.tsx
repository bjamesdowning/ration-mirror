import { useState } from "react";
import { FilterSheet } from "./FilterSheet";

interface MobilePageHeaderProps {
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
}

/**
 * MobilePageHeader - A simplified, mobile-optimized page header.
 * Shows icon + title inline with optional item count badge.
 * Search and filters are cleanly integrated.
 *
 * Part of Option B: Unified Control Bar UI redesign.
 */
export function MobilePageHeader({
	icon,
	title,
	itemCount,
	showSearch = false,
	searchPlaceholder = "Search...",
	onSearchChange,
	filterContent,
	hasActiveFilters = false,
}: MobilePageHeaderProps) {
	const [isFilterOpen, setIsFilterOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setSearchQuery(e.target.value);
		onSearchChange?.(e.target.value);
	};

	return (
		<>
			<header className="mb-4">
				{/* Title row */}
				<div className="flex items-center justify-between mb-3">
					<div className="flex items-center gap-2">
						<span className="text-2xl">{icon}</span>
						<h1 className="text-2xl font-bold text-carbon dark:text-white">
							{title}
						</h1>
						{itemCount !== undefined && (
							<span className="text-sm font-medium text-muted bg-platinum dark:bg-white/10 px-2 py-0.5 rounded-full">
								{itemCount}
							</span>
						)}
					</div>

					{/* Filter button (mobile only, if filterContent provided) */}
					{filterContent && (
						<button
							type="button"
							onClick={() => setIsFilterOpen(true)}
							className={`
								md:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all
								${
									hasActiveFilters
										? "bg-hyper-green/10 text-hyper-green border border-hyper-green"
										: "bg-platinum dark:bg-white/10 text-carbon dark:text-white/80"
								}
							`}
						>
							<FilterIcon />
							{hasActiveFilters && (
								<span className="sr-only">Filters active</span>
							)}
						</button>
					)}
				</div>

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

				{/* Desktop filters inline */}
				{filterContent && (
					<div className="hidden md:block mt-4">{filterContent}</div>
				)}
			</header>

			{/* Mobile filter sheet */}
			{filterContent && (
				<FilterSheet
					isOpen={isFilterOpen}
					onClose={() => setIsFilterOpen(false)}
					title="Filters"
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
