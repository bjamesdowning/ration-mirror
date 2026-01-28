import { NavLink } from "react-router";

const navItems = [
	{ to: "/dashboard", icon: "home", label: "Dashboard" },
	{ to: "/dashboard/pantry", icon: "package", label: "Pantry" },
	{ to: "/dashboard/meals", icon: "chef-hat", label: "Meals" },
	{ to: "/dashboard/grocery", icon: "shopping-cart", label: "Grocery" },
	{ to: "/dashboard/settings", icon: "settings", label: "Settings" },
];

export function BottomNav() {
	return (
		<nav className="md:hidden fixed bottom-0 left-0 right-0 bg-ceramic/95 backdrop-blur-lg border-t border-platinum safe-area-pb z-50">
			<div className="flex items-center justify-around h-16 px-2">
				{navItems.map((item) => (
					<NavItem key={item.to} {...item} />
				))}
			</div>
		</nav>
	);
}

function NavItem({
	to,
	icon,
	label,
}: {
	to: string;
	icon: string;
	label: string;
}) {
	return (
		<NavLink
			to={to}
			end={to === "/dashboard"}
			className={({ isActive }) =>
				`flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg transition-colors ${
					isActive ? "text-hyper-green" : "text-muted"
				}`
			}
		>
			<NavIcon name={icon} />
			<span className="text-[10px] font-medium">{label}</span>
		</NavLink>
	);
}

// Reuse the same icon components from RailSidebar
function NavIcon({ name }: { name: string }) {
	const icons: Record<string, React.ReactNode> = {
		home: (
			<svg
				aria-hidden="true"
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
				aria-hidden="true"
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
				aria-hidden="true"
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
				aria-hidden="true"
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
				aria-hidden="true"
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
