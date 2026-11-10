/** Hub action menu. Each id starts the feature's existing flow. */
export const HUB_ACTION_PARAM = "hubAction";

export const HUB_ACTION_LOG_TO_FUEL = "Log to Fuel";
export const HUB_ACTION_SCAN_TO_CARGO = "Scan to Cargo";
export const HUB_ACTION_GENERATE_MEAL = "Generate Meal";
export const HUB_ACTION_PLAN_WEEK = "Plan Week";
/** Product name on Supply. Billy's "Dock from Receipt" is this label. */
export const HUB_ACTION_DOCK_FROM_RECEIPT = "Dock from Receipt";

export const HUB_ACTION_LABELS = [
	HUB_ACTION_LOG_TO_FUEL,
	HUB_ACTION_SCAN_TO_CARGO,
	HUB_ACTION_GENERATE_MEAL,
	HUB_ACTION_PLAN_WEEK,
	HUB_ACTION_DOCK_FROM_RECEIPT,
] as const;

export type HubActionId =
	| "log-to-fuel"
	| "scan-to-cargo"
	| "generate-meal"
	| "plan-week"
	| "dock-from-receipt";

export type HubActionFlags = {
	logToFuel: boolean;
	scanToCargo: boolean;
	generateMeal: boolean;
	planWeek: boolean;
	dockFromReceipt: boolean;
};

const HUB_ACTIONS: readonly {
	id: HubActionId;
	label: (typeof HUB_ACTION_LABELS)[number];
	flag: keyof HubActionFlags;
	path: string;
}[] = [
	{
		id: "log-to-fuel",
		label: HUB_ACTION_LOG_TO_FUEL,
		flag: "logToFuel",
		path: "/hub/manifest",
	},
	{
		id: "scan-to-cargo",
		label: HUB_ACTION_SCAN_TO_CARGO,
		flag: "scanToCargo",
		path: "/hub/cargo",
	},
	{
		id: "generate-meal",
		label: HUB_ACTION_GENERATE_MEAL,
		flag: "generateMeal",
		path: "/hub/galley",
	},
	{
		id: "plan-week",
		label: HUB_ACTION_PLAN_WEEK,
		flag: "planWeek",
		path: "/hub/manifest",
	},
	{
		id: "dock-from-receipt",
		label: HUB_ACTION_DOCK_FROM_RECEIPT,
		flag: "dockFromReceipt",
		path: "/hub/supply",
	},
];

export type HubAction = (typeof HUB_ACTIONS)[number];

/** Visible rows, in menu order. A flag that is off drops that row only. */
export function visibleHubActions(flags: HubActionFlags): HubAction[] {
	return HUB_ACTIONS.filter((action) => flags[action.flag]);
}

export function hubActionPath(id: HubActionId): string {
	const action = HUB_ACTIONS.find((row) => row.id === id);
	if (!action) return "/hub";
	return `${action.path}?${HUB_ACTION_PARAM}=${id}`;
}

export function isHubActionId(value: string | null): value is HubActionId {
	return HUB_ACTIONS.some((action) => action.id === value);
}
