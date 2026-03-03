import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

const E2E_CARGO_NAME = "e2e-cargo-test";

test.describe("cargo", () => {
	test("add and delete cargo item with cleanup", async ({
		authenticatedPage: page,
	}) => {
		await page.goto("/hub/cargo");

		// Open Add form (hidden by default; toggle to show)
		await page.getByRole("button", { name: "Add Item" }).first().click();

		// Add item
		await page.getByLabel("Item Name").fill(E2E_CARGO_NAME);
		await page.getByLabel("Quantity").fill("1");
		await page.getByLabel("Unit").selectOption("unit");
		await page.getByRole("button", { name: "Add Item" }).click();

		// Wait for item to appear (handle merge modal if duplicate exists)
		const mergeNew = page.getByRole("button", { name: "Create New Item" });
		if (await mergeNew.isVisible().catch(() => false)) {
			await mergeNew.click();
		}

		await expect(page.getByText(E2E_CARGO_NAME)).toBeVisible({
			timeout: 5000,
		});

		// Cleanup: delete the item we created (desktop: hover reveals overlay with Delete)
		const card = page
			.locator(".glass-panel")
			.filter({ hasText: E2E_CARGO_NAME });
		await card.hover();
		await card.getByRole("button", { name: "Delete" }).click();

		// Verify item is removed
		await expect(page.getByText(E2E_CARGO_NAME)).not.toBeVisible({
			timeout: 5000,
		});
	});
});
