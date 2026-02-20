import { NavLink } from "react-router";
import { NAV_ICONS } from "~/components/icons/PageIcons";

const navItems = [
	{ to: "/hub", icon: "home", label: "Hub" },
	{ to: "/hub/cargo", icon: "package", label: "Cargo" },
	{ to: "/hub/galley", icon: "chef-hat", label: "Galley" },
	{ to: "/hub/supply", icon: "shopping-cart", label: "Supply" },
	{ to: "/hub/settings", icon: "settings", label: "System" },
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
			end={to === "/hub"}
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

function NavIcon({ name }: { name: string }) {
	const Icon = NAV_ICONS[name];
	return Icon ? <Icon className="w-5 h-5" /> : null;
}
