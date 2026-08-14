export const LOOP_STAGES = [
	{
		id: "cargo",
		number: "01",
		title: "Cargo",
		verb: "Know what you have.",
		detail: "Track quantity and expiry in one live inventory.",
		signal: "18 items ready · 3 expiring soon",
	},
	{
		id: "galley",
		number: "02",
		title: "Galley",
		verb: "See what you can cook.",
		detail: "Match recipes against the food already at home.",
		signal: "6 meals available now",
	},
	{
		id: "manifest",
		number: "03",
		title: "Manifest",
		verb: "Plan the week.",
		detail: "Schedule meals around your time and real stock.",
		signal: "5 dinners planned",
	},
	{
		id: "supply",
		number: "04",
		title: "Supply",
		verb: "Buy only the gaps.",
		detail: "Turn missing ingredients into one shopping list.",
		signal: "11 missing items consolidated",
	},
	{
		id: "dock",
		number: "05",
		title: "Dock",
		verb: "Close the loop.",
		detail:
			"Add purchases to Cargo and deduct what you cook. Log your serving if you are tracking — that stays private.",
		signal: "Cargo updated · serving logged privately",
	},
] as const;

export type LoopStageId = (typeof LOOP_STAGES)[number]["id"];

const FUEL_STAGE_IDS: ReadonlySet<LoopStageId> = new Set(["manifest", "dock"]);

/** Personal Daily Fuel is a private overlay, not a sixth household stage. */
export function stageShowsFuel(stageId: LoopStageId): boolean {
	return FUEL_STAGE_IDS.has(stageId);
}

export function loopStageIndex(stageId: LoopStageId): number {
	return LOOP_STAGES.findIndex((stage) => stage.id === stageId);
}
