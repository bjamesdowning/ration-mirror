import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

test.describe("galley", () => {
	test("add and delete meal with cleanup", async ({
		authenticatedPage: page,
	}) => {
		const mealName = `e2e-galley-meal-${Date.now()}`;
		await page.goto("/hub/galley");

		// Open Add flow: click Add, then Recipe
		await page.getByRole("button", { name: "Add" }).first().click();
		await page.getByRole("button", { name: "Recipe" }).click();

		// Fill meal name and create
		await page.getByLabel("Meal Name").fill(mealName);
		await page.getByRole("button", { name: "Create Meal" }).click();

		// Create Meal redirects to /hub/galley/:id (detail page)
		await expect(page).toHaveURL(/\/hub\/galley\/[^/]+/);
		await expect(page.getByText(mealName)).toBeVisible({
			timeout: 5000,
		});

		// Cleanup: delete from detail page (Delete opens confirm dialog)
		await page.getByRole("button", { name: "Delete" }).click();
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Delete" })
			.click();

		// Verify redirect to list and meal is removed
		await expect(page).toHaveURL("/hub/galley");
		await expect(page.getByText(mealName)).toHaveCount(0);
	});

	test("edit meal name", async ({ authenticatedPage: page }) => {
		const mealName = `e2e-galley-edit-${Date.now()}`;
		const editedName = `${mealName}-edited`;
		await page.goto("/hub/galley");

		// Create meal
		await page.getByRole("button", { name: "Add" }).first().click();
		await page.getByRole("button", { name: "Recipe" }).click();
		await page.getByLabel("Meal Name").fill(mealName);
		await page.getByRole("button", { name: "Create Meal" }).click();
		await expect(page).toHaveURL(/\/hub\/galley\/.+/);

		// Edit meal
		await page.getByRole("link", { name: "Edit" }).click();
		await expect(page).toHaveURL(/\/hub\/galley\/.+\/edit/);
		await page.getByLabel("Name").fill(editedName);
		await page.getByRole("button", { name: "Update Meal" }).click();

		// Verify redirect to detail and new name
		await expect(page).toHaveURL(/\/hub\/galley\/[^/]+$/);
		await expect(page.getByText(editedName)).toBeVisible({ timeout: 5000 });

		// Cleanup
		await page.getByRole("button", { name: "Delete" }).click();
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Delete" })
			.click();
	});
});

// AI features: smaller subset, run separately with test:e2e --grep "AI"
test.describe("AI features", () => {
	test.skip("generate meal uses AI", async () => {
		// Skipped by default - runs Workers AI, costs credits, slower.
		// Run with: bun run test:e2e --grep "AI"
	});
});
