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
	});

	test("privacy policy page loads", async ({ page }) => {
		await page.goto("/legal/privacy");
		await expect(
			page.getByRole("heading", { name: "Privacy Policy", exact: true }),
		).toBeVisible({
			timeout: 5000,
		});
		await expect(page.getByText("Information We Collect")).toBeVisible();
	});
});
