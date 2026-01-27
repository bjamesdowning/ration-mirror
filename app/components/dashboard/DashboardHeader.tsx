// @ts-nocheck
import { useFetcher } from "react-router";

interface DashboardHeaderProps {
	title: string;
	subtitle: string;
	showSearch?: boolean;
	totalItems?: number;
}

export function DashboardHeader({
	title,
	subtitle,
	showSearch = false,
	totalItems,
}: DashboardHeaderProps) {
	const searchFetcher = useFetcher();

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
					<searchFetcher.Form
						method="get"
						action="/api/search"
						className="relative group"
					>
						<input
							type="text"
							name="q"
							placeholder="Search..."
							className="w-full bg-platinum/50 border border-platinum rounded-lg p-2 pl-4 text-sm text-carbon placeholder:text-muted focus:border-hyper-green focus:ring-1 focus:ring-hyper-green outline-none transition-all"
							onChange={(e) => {
								if (e.target.value.length > 2) {
									searchFetcher.submit(e.target.form);
								}
							}}
						/>
						<div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted pointer-events-none uppercase tracking-wide">
							Semantic
						</div>
					</searchFetcher.Form>
				</div>
			)}

			<div className="text-right whitespace-nowrap">
				{totalItems !== undefined && (
					<>
						<p className="text-xs uppercase text-muted tracking-wide">
							Total Items
						</p>
						<p className="text-2xl font-bold text-carbon">{totalItems}</p>
					</>
				)}
			</div>
		</header>
	);
}
