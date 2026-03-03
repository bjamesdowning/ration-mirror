import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

test.describe("navigation", () => {
	test("hub sidebar navigates to Cargo, Galley, Manifest, Supply", async ({
		authenticatedPage: page,
	}) => {
		await page.goto("/hub");

		// Use aside href to target sidebar links (avoids "Manage Cargo →" etc. on hub widgets)
		await page.locator('aside a[href="/hub/cargo"]').click();
		await expect(page).toHaveURL("/hub/cargo");
		// Cargo page shows "Cargo" (title) or "Cargo Hold Empty" — avoid strict mode
		await expect(
			page.getByRole("heading", { name: "Cargo", exact: true }),
		).toBeVisible();

		await page.locator('aside a[href="/hub/galley"]').click();
		await expect(page).toHaveURL("/hub/galley");

		await page.locator('aside a[href="/hub/manifest"]').click();
		await expect(page).toHaveURL(/\/hub\/manifest/);

		await page.locator('aside a[href="/hub/supply"]').click();
		await expect(page).toHaveURL("/hub/supply");
	});

	test("settings link navigates to settings", async ({
		authenticatedPage: page,
	}) => {
		await page.goto("/hub");
		await page.getByRole("link", { name: "System settings" }).click();
		await expect(page).toHaveURL("/hub/settings");
	});
});
