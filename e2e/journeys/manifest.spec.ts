import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

const E2E_MANIFEST_MEAL = `e2e-manifest-meal-${Date.now()}`;

test.describe("manifest", () => {
	test("manifest page loads and shows week view", async ({
		authenticatedPage: page,
	}) => {
		await page.goto("/hub/manifest");

		// Week navigator or calendar should be visible
		await expect(
			page.getByRole("button", { name: /Previous|Next|week/i }).first(),
		).toBeVisible({ timeout: 5000 });
	});

	test("add and remove meal entry", async ({ authenticatedPage: page }) => {
		// 1. Create a meal in Galley
		await page.goto("/hub/galley");
		await page.getByRole("button", { name: "Add" }).first().click();
		await page.getByRole("button", { name: "Recipe" }).click();
		await page.getByLabel("Meal Name").fill(E2E_MANIFEST_MEAL);
		await page.getByRole("button", { name: "Create Meal" }).click();
		await expect(page).toHaveURL(/\/hub\/galley\/.+/);

		// 2. Go to Manifest and add meal to a slot
		await page.goto("/hub/manifest");
		await page
			.getByRole("button", {
				name: /^Plus( (Breakfast|Lunch|Dinner|Snack))?$/,
			})
			.first()
			.click();

		// 3. Meal picker opens — select our meal and confirm
		await expect(page.getByRole("heading", { name: "Add Meal" })).toBeVisible({
			timeout: 5000,
		});
		await expect(
			page
				.getByRole("button", {
					name: new RegExp(`^${E2E_MANIFEST_MEAL}\\s+\\d+\\s+srv$`),
				})
				.first(),
		).toBeVisible({
			timeout: 5000,
		});
		await page
			.getByRole("button", {
				name: new RegExp(`^${E2E_MANIFEST_MEAL}\\s+\\d+\\s+srv$`),
			})
			.first()
			.click();
		await page
			.getByRole("button", { name: /Add to (Breakfast|Lunch|Dinner|Snack)/ })
			.click();

		// 4. Entry should appear
		await expect(
			page.getByRole("button", { name: `Remove ${E2E_MANIFEST_MEAL}` }).first(),
		).toBeVisible({
			timeout: 5000,
		});

		// 5. Remove entry (hover to reveal Remove button on desktop, or it may be visible on mobile)
		await page
			.getByRole("button", { name: `Remove ${E2E_MANIFEST_MEAL}` })
			.first()
			.click();

		// 6. Entry should be gone
		await expect(
			page.getByRole("button", { name: `Remove ${E2E_MANIFEST_MEAL}` }),
		).toHaveCount(0, { timeout: 5000 });

		// 7. Cleanup: delete meal from Galley
		await page.goto(`/hub/galley`);
		await page.getByRole("link", { name: E2E_MANIFEST_MEAL }).click();
		await page.getByRole("button", { name: "Delete" }).click();
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Delete" })
			.click();
	});
});
