/** Save is the only moment a full Fuel day opens Crew. */
export type FuelSavePresentation = "paywall" | "message";

export function presentFuelSave(
	code: string | null | undefined,
): FuelSavePresentation {
	return code === "fuel_daily_limit" ? "paywall" : "message";
}

/** Plate-up save. A logged or cleared body wins over the cap code. */
export type ManifestIntakeSavePresentation =
	| "saved"
	| "cleared"
	| "paywall"
	| "message"
	| "idle";

export function presentManifestIntakeSave(
	body:
		| {
				intake?: unknown;
				cleared?: unknown;
				code?: string | null;
				error?: string | null;
		  }
		| null
		| undefined,
): ManifestIntakeSavePresentation {
	if (body?.intake) return "saved";
	if (body?.cleared) return "cleared";
	if (presentFuelSave(body?.code) === "paywall") return "paywall";
	if (body?.error) return "message";
	return "idle";
}
