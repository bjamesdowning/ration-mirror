/**
 * Fuel stays off in the shared E2E server. Flag-on navigation is checked
 * against a local process that sets the override only for that process.
 */
import { expect, test } from "@playwright/test";

test.describe("fuel page flag off", () => {
	test("the phone and rail do not offer Fuel", async ({ page }) => {
		await page.goto("/hub");
		await expect(page.getByRole("link", { name: "Fuel" })).toHaveCount(0);
		await page.goto("/hub/fuel");
		await expect(page).not.toHaveURL(/\/hub\/fuel/);
		await expect(page.getByRole("button", { name: "Add Fuel" })).toHaveCount(0);
	});
});
