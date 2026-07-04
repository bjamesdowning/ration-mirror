import type { Page } from "@playwright/test";

type MealSummary = { id: string; name: string };

/** Delete leftover meals from prior E2E runs so free-tier capacity stays available. */
export async function cleanupE2eMeals(page: Page) {
	const res = await page.request.get("/api/meals");
	if (!res.ok()) return;

	const body = (await res.json()) as { meals?: MealSummary[] };
	const meals = body.meals ?? [];
	const toDelete = meals.filter((meal) => meal.name.startsWith("e2e-"));

	for (const meal of toDelete) {
		await page.request.delete(`/api/meals/${meal.id}`);
	}
}

export async function deleteMealById(page: Page, mealId: string) {
	await page.request.delete(`/api/meals/${mealId}`);
}
