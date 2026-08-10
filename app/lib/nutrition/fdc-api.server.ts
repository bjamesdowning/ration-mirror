/**
 * Live USDA FoodData Central search fallback (name-only; cached).
 * Requires USDA_FDC_API_KEY secret. Used only after local alias + FTS miss.
 * Callers must filter returned ids to those present in NUTRITION_DB before hydrate.
 */
import type { FoodMatchCandidate } from "./rank-food-match";

const FDC_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";

type FdcSearchFood = {
	fdcId?: number;
	description?: string;
	dataType?: string;
};

/**
 * Search FDC for Foundation / SR Legacy / Survey (FNDDS). Returns candidates
 * for the existing JS ranker. Empty when key missing or request fails.
 */
export async function searchFdcApiCandidates(
	env: Env,
	query: string,
): Promise<FoodMatchCandidate[]> {
	const apiKey = env.USDA_FDC_API_KEY?.trim();
	if (!apiKey || !query.trim()) return [];

	try {
		const res = await fetch(`${FDC_SEARCH_URL}?api_key=${apiKey}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				query,
				dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"],
				pageSize: 25,
				pageNumber: 1,
			}),
		});
		if (!res.ok) return [];
		const body = (await res.json()) as { foods?: FdcSearchFood[] };
		const foods = body.foods ?? [];
		return foods
			.filter(
				(f): f is FdcSearchFood & { fdcId: number; description: string } =>
					typeof f.fdcId === "number" &&
					typeof f.description === "string" &&
					f.description.length > 0,
			)
			.map((f) => ({
				fdcId: f.fdcId,
				description: f.description,
				dataType: f.dataType,
			}));
	} catch {
		return [];
	}
}
