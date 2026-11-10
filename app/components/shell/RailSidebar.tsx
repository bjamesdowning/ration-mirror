import { NavLink, useRouteLoaderData } from "react-router";
import { NAV_ICONS } from "~/components/icons/PageIcons";
import { fuelNavItems } from "~/lib/shell/fuel-nav";

export function RailSidebar() {
	const rootData = useRouteLoaderData("root") as
		| { clientFlags?: { nutritionFuelPage?: boolean } }
		| undefined;
	const navItems = fuelNavItems(
		rootData?.clientFlags?.nutritionFuelPage === true,
	).rail;
	return (
		<aside className="hidden md:flex flex-col w-20 h-screen bg-ceramic border-r border-platinum sticky top-0">
			{/* Logo */}
			<div className="p-4 flex justify-center">
				<img src="/static/ration-logo.png" alt="Ration" className="w-10 h-10" />
			</div>

			{/* Navigation */}
			<nav className="flex-1 flex flex-col items-center gap-2 py-4">
				{navItems.map((item) => (
					<NavLink
						key={item.to}
						to={item.to}
						end={item.to === "/hub"}
						prefetch="intent"
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
