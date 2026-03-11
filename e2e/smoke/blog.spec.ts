import { expect, test } from "@playwright/test";

test.describe("blog", () => {
	test("blog index loads and shows post list", async ({ page }) => {
		await page.goto("/blog");
		await expect(
			page.getByRole("heading", { name: "From the crew" }),
		).toBeVisible({
			timeout: 5000,
		});
		// At least one post link should be visible
		await expect(
			page.getByRole("link", { name: /Read →/ }).first(),
		).toBeVisible();
	});

	test("click post link navigates to post page", async ({ page }) => {
		await page.goto("/blog");
		// Click first post (use meal-planning-loop or any existing slug)
		await page
			.getByRole("link", { name: /Read →/ })
			.first()
			.click();
		await expect(page).toHaveURL(/\/blog\/.+/);
		// Post page should have article content
		await expect(page.getByRole("article")).toBeVisible({ timeout: 5000 });
	});

	test("invalid slug returns 404 and error boundary", async ({ page }) => {
		await page.goto("/blog/nonexistent-slug-xyz-404");
		await expect(
			page.getByRole("heading", { name: "404 :: NOT FOUND" }),
		).toBeVisible({
			timeout: 5000,
		});
		await expect(
			page.getByText(
				"THE REQUESTED RESOURCE COULD NOT BE LOCATED IN THE DATABANKS.",
			),
		).toBeVisible();
	});
});
