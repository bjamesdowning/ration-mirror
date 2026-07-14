import { expect, test } from "@playwright/test";

test.describe("legal", () => {
	test("terms of service page loads", async ({ page }) => {
		await page.goto("/legal/terms");
		await expect(
			page.getByRole("heading", { name: "Terms of Service" }),
		).toBeVisible({
			timeout: 5000,
		});
		await expect(page.getByText("Acceptance of Terms")).toBeVisible();
		const traderSection = page.locator("#trader-information");
		await expect(traderSection).toBeVisible();
		await expect(traderSection).toContainText("Mayutic");
		await expect(traderSection).toContainText("777497");
		await expect(traderSection).toContainText(
			"6 Dundrum Wood, Ballinteer Road",
		);
	});

	test("privacy policy page loads", async ({ page }) => {
		await page.goto("/legal/privacy");
		await expect(
			page.getByRole("heading", { name: "Privacy Policy", exact: true }),
		).toBeVisible({
			timeout: 5000,
		});
		await expect(page.getByText("Information We Collect")).toBeVisible();
		await expect(page.getByText("data controller")).toBeVisible();
		await expect(
			page.getByText("Data Protection Commission (Ireland)"),
		).toBeVisible();
	});
});
