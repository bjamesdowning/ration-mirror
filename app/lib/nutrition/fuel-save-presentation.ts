/** Save is the only moment a full Fuel day opens Crew. */
export type FuelSavePresentation = "paywall" | "message";

export function presentFuelSave(
	code: string | null | undefined,
): FuelSavePresentation {
	return code === "fuel_daily_limit" ? "paywall" : "message";
}
