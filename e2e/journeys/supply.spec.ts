import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

test.describe("supply", () => {
	test("add and delete supply item with cleanup", async ({
		authenticatedPage: page,
	}) => {
		const itemName = `e2e-supply-${Date.now()}`;
		await page.goto("/hub/supply");

		// Open Add form
		await page.getByRole("button", { name: "Add Item" }).first().click();

		await page.getByLabel("Item Name").fill(itemName);
		await page.getByRole("button", { name: "Add to Supply" }).click();

		// Wait for item to appear
		await expect(page.getByText(itemName)).toBeVisible({
			timeout: 5000,
		});

		// Cleanup: find row with item, click Remove, confirm
		const row = page
			.locator("[class*='border-b']")
			.filter({ hasText: itemName });
		await row.getByRole("button", { name: "Remove item" }).click();

		// Confirm dialog (exact: true to avoid matching "Remove item" row action)
		await page.getByRole("button", { name: "Remove", exact: true }).click();

		// Verify item is removed
		await expect(page.getByText(itemName)).toHaveCount(0);
	});
});
