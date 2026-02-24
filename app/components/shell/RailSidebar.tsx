import { NavLink } from "react-router";
import { NAV_ICONS } from "~/components/icons/PageIcons";

const navItems = [
	{ to: "/hub", icon: "home", label: "Hub" },
	{ to: "/hub/cargo", icon: "package", label: "Cargo" },
	{ to: "/hub/galley", icon: "chef-hat", label: "Galley" },
	{ to: "/hub/manifest", icon: "calendar", label: "Manifest" },
	{ to: "/hub/supply", icon: "shopping-cart", label: "Supply" },
];

export function RailSidebar() {
	return (
		<aside className="hidden md:flex flex-col w-20 h-screen bg-ceramic border-r border-platinum sticky top-0">
			{/* Logo */}
			<div className="p-4 flex justify-center">
				<img src="/static/ration-logo.svg" alt="Ration" className="w-10 h-10" />
			</div>

			{/* Navigation */}
			<nav className="flex-1 flex flex-col items-center gap-2 py-4">
				{navItems.map((item) => (
					<NavLink
						key={item.to}
						to={item.to}
						end={item.to === "/hub"}
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
		</aside>
	);
}

function NavIcon({ name }: { name: string }) {
	const Icon = NAV_ICONS[name];
	return Icon ? <Icon className="w-5 h-5" /> : null;
}
