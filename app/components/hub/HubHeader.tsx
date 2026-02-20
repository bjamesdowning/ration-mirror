// @ts-nocheck
import { useFetcher, useRouteLoaderData } from "react-router";
import type { loader } from "../../routes/hub";

function formatRelativeTime(dateString: string) {
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.round(diffMs / 60000);
	const diffHours = Math.round(diffMins / 60);

	if (diffMins < 1) return "Just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	return "Yesterday";
}

interface HubHeaderProps {
	title: string;
	subtitle: string;
	showSearch?: boolean;
	totalItems?: number;
	/** Placeholder text for search input */
	searchPlaceholder?: string;
	/** Callback for controlled search (local filtering) - if provided, uses local state instead of API */
	onSearchChange?: (query: string) => void;
}

export function HubHeader({
	title,
	subtitle,
	showSearch = false,
	totalItems,
	searchPlaceholder = "Search...",
	onSearchChange,
}: HubHeaderProps) {
	const searchFetcher = useFetcher();
	const fetcher = useFetcher();
	const hubData = useRouteLoaderData<typeof loader>("routes/hub");
	const lastGeneratedAt = hubData?.lastGeneratedAt;
	const isGenerating = fetcher.state === "submitting";

	// Use controlled mode if onSearchChange is provided
	const isControlled = !!onSearchChange;

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (isControlled) {
			onSearchChange(e.target.value);
		} else if (e.target.value.length > 2) {
			searchFetcher.submit(e.target.form);
		}
	};

	return (
		<header className="mb-8 border-b border-platinum pb-4 flex flex-col md:flex-row justify-between items-end gap-4">
			<div>
				<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-carbon">
					{title}
				</h1>
				<p className="text-muted text-sm">{subtitle}</p>
			</div>

			{showSearch && (
				<div className="w-full md:w-auto flex-1 md:max-w-md mx-4">
					{isControlled ? (
						// Controlled local search (no API call)
						<div className="relative group">
							<input
								type="text"
								placeholder={searchPlaceholder}
								className="w-full bg-platinum/50 border border-platinum rounded-lg p-2 pl-4 text-sm text-carbon placeholder:text-muted focus:border-hyper-green focus:ring-1 focus:ring-hyper-green outline-none transition-all"
								onChange={handleSearchChange}
							/>
							<div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted pointer-events-none uppercase tracking-wide">
								Local
							</div>
						</div>
					) : (
						// Semantic API search (existing behavior)
						<searchFetcher.Form
							method="get"
							action="/api/search"
							className="relative group"
						>
							<input
								type="text"
								name="q"
								placeholder={searchPlaceholder}
								className="w-full bg-platinum/50 border border-platinum rounded-lg p-2 pl-4 text-sm text-carbon placeholder:text-muted focus:border-hyper-green focus:ring-1 focus:ring-hyper-green outline-none transition-all"
								onChange={handleSearchChange}
							/>
							<div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted pointer-events-none uppercase tracking-wide">
								Semantic
							</div>
						</searchFetcher.Form>
					)}
				</div>
			)}

			<div className="flex flex-col items-end gap-1">
				{totalItems !== undefined && (
					<div className="text-right whitespace-nowrap">
						<p className="text-xs uppercase text-muted tracking-wide">
							Total Items
						</p>
						<p className="text-2xl font-bold text-carbon">{totalItems}</p>
					</div>
				)}

				{/* Automation Status & Refresh */}
				{lastGeneratedAt && (
					<div className="flex items-center gap-2 mt-2">
						<span className="text-[10px] uppercase tracking-wide text-muted">
							Auto-List: {formatRelativeTime(lastGeneratedAt)}
						</span>
						<fetcher.Form method="post" action="/api/automation/trigger">
							<button
								type="submit"
								disabled={isGenerating}
								title="Generate List Now"
								className="p-1 hover:bg-platinum rounded-md text-hyper-green transition-colors disabled:opacity-50"
							>
								<svg
									aria-hidden="true"
									xmlns="http://www.w3.org/2000/svg"
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									className={isGenerating ? "animate-spin" : ""}
								>
									<title>Refresh List</title>
									<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
									<path d="M3 3v5h5" />
									<path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
									<path d="M16 16h5v5" />
								</svg>
							</button>
						</fetcher.Form>
					</div>
				)}
			</div>
		</header>
	);
}
