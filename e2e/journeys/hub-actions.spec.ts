import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { gotoHubPage, openPanelQuickAdd } from "../helpers/hub";

test.describe("hub action menu", () => {
	test("opens each enabled AI flow from the hub menu", async ({
		authenticatedPage: page,
	}) => {
		await gotoHubPage(page, "/hub");
		const hubActions = page.getByRole("button", { name: "Hub actions" });
		await expect(hubActions).toBeVisible();
		await hubActions.click();

		const menu = page.getByRole("menu", { name: "Hub actions" });
		await expect(menu.getByRole("menuitem")).toHaveText([
			"Scan to Cargo",
			"Generate Meal",
			"Plan Week",
			"Dock from Receipt",
		]);

		await menu.getByRole("menuitem", { name: "Scan to Cargo" }).click();
		await expect(page).toHaveURL(/\/hub\/cargo/);
		await expect(
			page.getByRole("heading", { name: "Scan to add items" }),
		).toBeVisible();
		await page
			.getByRole("button", { name: "Close modal" })
			.filter({ hasText: "Close" })
			.click();

		await gotoHubPage(page, "/hub");
		await page.getByRole("button", { name: "Hub actions" }).click();
		await page.getByRole("menuitem", { name: "Generate Meal" }).click();
		await expect(page).toHaveURL(/\/hub\/galley/);
		await expect(
			page.getByRole("heading", { name: "AI Meal Assistant" }),
		).toBeVisible();
		await page
			.getByRole("button", { name: "Close modal" })
			.filter({ hasText: "Close" })
			.click();

		await gotoHubPage(page, "/hub");
		await page.getByRole("button", { name: "Hub actions" }).click();
		await page.getByRole("menuitem", { name: "Plan Week" }).click();
		await expect(page).toHaveURL(/\/hub\/manifest/);
		await expect(
			page.getByRole("heading", { name: "Weekly Meal Planner" }),
		).toBeVisible();
		await page
			.getByRole("button", { name: "Close modal" })
			.filter({ hasText: "Close" })
			.click();

		await gotoHubPage(page, "/hub");
		await page.getByRole("button", { name: "Hub actions" }).click();
		await page.getByRole("menuitem", { name: "Dock from Receipt" }).click();
		await expect(page).toHaveURL(/\/hub\/supply/);
		await expect(
			page.getByRole("heading", { name: "Dock from Receipt" }),
		).toBeVisible();
		await page.getByRole("button", { name: "Close" }).click();
	});

	test("cargo detail actions lead with Delete then Edit", async ({
		authenticatedPage: page,
	}) => {
		const name = `e2e-hub-detail-${Date.now()}`;
		await gotoHubPage(page, "/hub/cargo");
		await openPanelQuickAdd(page);
		await page.getByLabel("Item Name").fill(name);
		await page.getByLabel("Quantity").fill("1");
		await page.getByLabel("Unit", { exact: true }).selectOption("unit");
		await page.getByRole("button", { name: "Add Item" }).click();
		const mergeNew = page.getByRole("button", { name: "Create New Item" });
		if (await mergeNew.isVisible().catch(() => false)) {
			await mergeNew.click();
		}
		await page.getByRole("link", { name }).click();
		await expect(page).toHaveURL(/\/hub\/cargo\//);
		const labels = page
			.getByTestId("detail-actions")
			.locator("[data-overflow-label]");
		await expect(labels).toHaveCount(3);
		await expect(labels.nth(0)).toHaveAttribute(
			"data-overflow-label",
			"Delete",
		);
		await expect(labels.nth(1)).toHaveAttribute("data-overflow-label", "Edit");
		await expect(labels.nth(2)).toHaveAttribute(
			"data-overflow-label",
			"Mark Empty",
		);
		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("button", { name: "Delete" }).last().click();
		await expect(page).toHaveURL(/\/hub\/cargo$/);
	});

	test("meal detail actions lead with Delete then Edit", async ({
		authenticatedPage: page,
	}) => {
		const name = `e2e-hub-meal-${Date.now()}`;
		await gotoHubPage(page, "/hub/galley/new");
		await page.getByLabel("Name").fill(name);
		await page.getByRole("button", { name: "Create Recipe" }).click();
		await expect(page).toHaveURL(/\/hub\/galley\//);
		const labels = page
			.getByTestId("detail-actions")
			.locator("[data-overflow-label]");
		await expect(labels).toHaveCount(2);
		await expect(labels.nth(0)).toHaveAttribute(
			"data-overflow-label",
			"Delete",
		);
		await expect(labels.nth(1)).toHaveAttribute("data-overflow-label", "Edit");
		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("button", { name: "Delete" }).last().click();
		await expect(page).toHaveURL(/\/hub\/galley$/);
	});
});
