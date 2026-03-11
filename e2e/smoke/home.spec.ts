import { expect, test } from "@playwright/test";

test.describe("home", () => {
	test("home page loads with hero and key links", async ({ page }) => {
		await page.goto("/");
		await expect(
			page.getByRole("heading", { name: /Ration\.app/i }),
		).toBeVisible({ timeout: 5000 });
		await expect(
			page
				.getByText("Cargo → Galley → Manifest → Supply → Dock → Repeat.")
				.first(),
		).toBeVisible();
		// Key footer/header links
		await expect(
			page.getByRole("link", { name: "Blog" }).first(),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Tools" }).first(),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Privacy Policy" }).first(),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Terms of Service" }).first(),
		).toBeVisible();
	});
});
