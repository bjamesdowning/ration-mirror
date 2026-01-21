// @ts-nocheck
import { Link, useFetcher, useLocation } from "react-router";

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
	const location = useLocation();

	return (
		<header className="mb-8 border-b border-[#39FF14] pb-4 flex flex-col md:flex-row justify-between items-end gap-4">
			<div>
				<h1 className="text-4xl font-black tracking-tighter uppercase glitch-text">
					{title}
				</h1>
				<p className="opacity-70 text-sm">{subtitle}</p>

				{/* Navigation Tabs (Optional but good for Settings context) */}
				<nav className="flex gap-4 mt-2 text-xs uppercase tracking-widest">
					<Link
						to="/dashboard"
						className={
							location.pathname === "/dashboard"
								? "text-[#39FF14] underline"
								: "opacity-50 hover:opacity-100"
						}
					>
						Manifest
					</Link>
					<Link
						to="/dashboard/credits"
						className={
							location.pathname === "/dashboard/credits"
								? "text-[#39FF14] underline"
								: "opacity-50 hover:opacity-100"
						}
					>
						Supply Depot
					</Link>
					<Link
						to="/dashboard/settings"
						className={
							location.pathname === "/dashboard/settings"
								? "text-[#39FF14] underline"
								: "opacity-50 hover:opacity-100"
						}
					>
						Configuration
					</Link>
				</nav>
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
							placeholder="SEARCH MANIFEST (SEMANTIC)..."
							className="w-full bg-black/50 border border-[#39FF14]/30 p-2 pl-4 text-sm focus:border-[#39FF14] outline-none uppercase tracking-widest transition-all"
							onChange={(e) => {
								if (e.target.value.length > 2) {
									searchFetcher.submit(e.target.form);
								}
							}}
						/>
						<div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] opacity-50 pointer-events-none">
							[VECTORIZE]
						</div>
					</searchFetcher.Form>
				</div>
			)}

			<div className="text-right whitespace-nowrap">
				{totalItems !== undefined && (
					<>
						<p className="text-xs uppercase opacity-70">Total Mass</p>
						<p className="text-2xl font-bold">{totalItems} ITEMS</p>
					</>
				)}
			</div>
		</header>
	);
}
