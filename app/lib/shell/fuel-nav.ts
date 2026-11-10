export type FuelNavIcon =
	| "home"
	| "flame"
	| "package"
	| "chef-hat"
	| "calendar"
	| "shopping-cart";

export type FuelNavItem = {
	to: string;
	icon: FuelNavIcon;
	label: string;
};

const HUB: FuelNavItem = { to: "/hub", icon: "home", label: "Hub" };
const FUEL: FuelNavItem = { to: "/hub/fuel", icon: "flame", label: "Fuel" };
const REST: FuelNavItem[] = [
	{ to: "/hub/cargo", icon: "package", label: "Cargo" },
	{ to: "/hub/galley", icon: "chef-hat", label: "Galley" },
	{ to: "/hub/manifest", icon: "calendar", label: "Manifest" },
	{ to: "/hub/supply", icon: "shopping-cart", label: "Supply" },
];

/** Desktop rail keeps Hub and adds Fuel. Phone nav stays five items. */
export function fuelNavItems(fuelPage: boolean): {
	rail: FuelNavItem[];
	bottom: FuelNavItem[];
} {
	if (!fuelPage) {
		const items = [HUB, ...REST];
		return { rail: items, bottom: items };
	}
	return {
		rail: [HUB, FUEL, ...REST],
		bottom: [FUEL, ...REST],
	};
}
