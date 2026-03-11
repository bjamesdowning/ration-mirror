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
			.getByTestId("supply-item-row")
			.filter({ hasText: itemName });
		await row.hover();
		await row.getByRole("button", { name: "Remove item" }).click();

		// Confirm dialog (exact: true to avoid matching "Remove item" row action)
		await page.getByRole("button", { name: "Remove", exact: true }).click();

		// Verify item is removed
		await expect(page.getByText(itemName)).toHaveCount(0, { timeout: 10000 });
	});

	test("mark item as purchased", async ({ authenticatedPage: page }) => {
		const itemName = `e2e-supply-purchased-${Date.now()}`;
		await page.goto("/hub/supply");

		// Add item
		await page.getByRole("button", { name: "Add Item" }).first().click();
		await page.getByLabel("Item Name").fill(itemName);
		await page.getByRole("button", { name: "Add to Supply" }).click();
		await expect(page.getByText(itemName)).toBeVisible({ timeout: 5000 });

		// Mark as purchased
		const row = page
			.getByTestId("supply-item-row")
			.filter({ hasText: itemName });
		await row.getByRole("button", { name: "Mark as purchased" }).click();
		await expect(
			page.getByRole("heading", { name: "What did you buy?" }),
		).toBeVisible({ timeout: 5000 });
		await page.getByRole("button", { name: /Use as listed/ }).click();

		// Item should show as purchased (strikethrough)
		await expect(
			row.getByRole("button", { name: "Mark as not purchased" }),
		).toBeVisible({ timeout: 5000 });

		// Cleanup
		await row.hover();
		await row.getByRole("button", { name: "Remove item" }).click();
		await page.getByRole("button", { name: "Remove", exact: true }).click();
	});
});
