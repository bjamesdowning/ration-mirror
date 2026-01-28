import { NavLink } from "react-router";

const navItems = [
	{ to: "/dashboard", icon: "home", label: "Dashboard" },
	{ to: "/dashboard/pantry", icon: "package", label: "Pantry" },
	{ to: "/dashboard/meals", icon: "chef-hat", label: "Meals" },
	{ to: "/dashboard/grocery", icon: "shopping-cart", label: "Grocery" },
	{ to: "/dashboard/settings", icon: "settings", label: "Settings" },
];

export function RailSidebar() {
	return (
		<aside className="hidden md:flex flex-col w-20 h-screen bg-ceramic border-r border-platinum sticky top-0">
			{/* Logo */}
			<div className="p-4 flex justify-center">
				<img
					src="/static/ration-logo-final-no-background-small.png"
					alt="Ration"
					className="w-10 h-10"
				/>
			</div>

			{/* Navigation */}
			<nav className="flex-1 flex flex-col items-center gap-2 py-4">
				{navItems.map((item) => (
					<NavLink
						key={item.to}
						to={item.to}
						end={item.to === "/dashboard"}
						className={({ isActive }) =>
							`w-14 h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
								isActive
									? "bg-hyper-green/10 text-hyper-green shadow-glow-sm"
									: "text-muted hover:bg-platinum hover:text-carbon"
							}`
						}
					>
						<NavIcon name={item.icon} />
						<span className="text-[10px] font-medium tracking-wide">
							{item.label}
						</span>
					</NavLink>
				))}
			</nav>

			{/* Visual Scan FAB for desktop - links to Pantry */}
			<div className="p-4">
				<NavLink
					to="/dashboard/pantry"
					className="w-14 h-14 rounded-full bg-hyper-green text-carbon flex items-center justify-center shadow-glow hover:scale-105 transition-transform"
					title="Visual Scan"
				>
					<ScanIcon />
				</NavLink>
			</div>
		</aside>
	);
}

// Simple icon components (inline SVG)
function NavIcon({ name }: { name: string }) {
	const icons: Record<string, React.ReactNode> = {
		home: (
			<svg
				className="w-5 h-5"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
				/>
			</svg>
		),
		package: (
			<svg
				className="w-5 h-5"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
				/>
			</svg>
		),
		"chef-hat": (
			<svg
				className="w-5 h-5"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-8.038 0l-2.387.477a2 2 0 00-1.022.547M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707"
				/>
			</svg>
		),
		"shopping-cart": (
			<svg
				className="w-5 h-5"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
				/>
			</svg>
		),
		settings: (
			<svg
				className="w-5 h-5"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
				/>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
				/>
			</svg>
		),
	};
	return icons[name] || null;
}

function ScanIcon() {
	return (
		<svg
			className="w-6 h-6"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M3 9V6a3 3 0 013-3h3M21 9V6a3 3 0 00-3-3h-3M3 15v3a3 3 0 003 3h3M21 15v3a3 3 0 01-3 3h-3M12 8v8m-4-4h8"
			/>
		</svg>
	);
}
