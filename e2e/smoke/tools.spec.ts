import { expect, test } from "@playwright/test";

test.describe("tools", () => {
	test("tools index loads with unit converter card", async ({ page }) => {
		await page.goto("/tools");
		await expect(
			page.getByRole("heading", { name: "Kitchen Tools" }),
		).toBeVisible({ timeout: 5000 });
		await expect(
			page.getByRole("link", { name: /Cooking Unit Converter/i }),
		).toBeVisible();
	});

	test("unit converter page loads with form", async ({ page }) => {
		await page.goto("/tools/unit-converter");
		await expect(page).toHaveURL("/tools/unit-converter");
		await expect(
			page.getByRole("heading", { name: "Cooking Unit Converter" }),
		).toBeVisible({ timeout: 5000 });
		await expect(
			page.getByText(/Convert between cups, grams, ounces/),
		).toBeVisible();
	});
});
